import {
    app,
    uuid,
    query,
    sparqlEscape
} from "mu";
import bodyParser from "body-parser";

let deleteAfterConsumption = process.env.PUSH_UPDATES_DELETE_AFTER_CONSUMPTION;
let sort = process.env.PUSH_UPDATES_SORTING_METHOD || "" // must be "ASC" or "DESC" all other values are interpreted as falsy (no sorting)
let refreshTimeout = process.env.PUSH_UPDATES_REFRESH_TIMEOUT || 10;
let maxTimeout = process.env.PUSH_UPDATES_MAX_TIMEOUT || 80; // in seconds
let maxRetries = maxTimeout * 1000 / refreshTimeout - 10;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
app.use(bodyParser.json());

// Map from key (format from getKeyForEvent ) to list of tabId's which are subscribed to that key
let cacheSubscriptions = {}


async function generatePushUpdates() {
    // Get all cache-clear events that are in the database
    let q = `
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX mucache: <http://mu.semte.ch/vocabularies/cache/>
    PREFIX dc:  <http://purl.org/dc/terms/>
    SELECT ?event ?path ?method ?query ?muAuthAllowedGroups ?muAuthUsedGroups
    WHERE {
      GRAPH <http://mu.semte.ch/application> {
        ?event a    mucache:CacheClear;
                    mucache:path ?path;
                    mucache:method ?method;
                    mucache:query ?query;
                    mucache:muAuthAllowedGroups ?muAuthAllowedGroups;
                    mucache:muAuthUsedGroups ?muAuthUsedGroups.
      }
    }`;
    let response = await query(q);
    // For each cache clear event: generate a push update for each tab-id that is subscribed to that key
    for (let e of response.results.bindings) {
        let path = e.path.value;
        let method = e.method.value;
        let urlQuery = e.query.value;
        let muAuthAllowedGroups = e.muAuthAllowedGroups.value;
        let muAuthUsedGroups = e.muAuthUsedGroups.value;

        // Generate the key for the cache-clear event given all it's details
        let key = getKeyForEvent(path, method, urlQuery, muAuthAllowedGroups, muAuthUsedGroups)
        // Get the list of tab id's that are subscribed
        let tabIdList = cacheSubscriptions[key] || []
        let now = new Date()
        let dateISOString = now.toISOString()
        // Set the type and realm for the cache-clear
        let type = "http://cache-clear-event"
        let realm = "http://cache"
        // Set the value to be an object containing the path, method and query of the cache-clear event
        let value = sparqlEscape(JSON.stringify({path: path, method: method, query: urlQuery}), 'string')
        for (let id of tabIdList) {
            let uuidValue = uuid()
            let q = `
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
            PREFIX mupush: <http://mu.semte.ch/vocabularies/push/>
            PREFIX dc:  <http://purl.org/dc/terms/>
            PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
            INSERT DATA {
                GRAPH<http://mu.semte.ch/application> {
                    <http://semte.baert.jp.net/push-updates/v0.1/${uuidValue}>  a mupush:PushUpdate;
                                                                                mu:uuid ${sparqlEscape(uuidValue, 'string')};
                                                                                mupush:tabId ${sparqlEscape(id, 'string')};
                                                                                mupush:realm <${realm}>;
                                                                                mupush:type <${type}>;
                                                                                rdf:value ${value};
                                                                                dc:created ${sparqlEscape(dateISOString, 'string')}^^xsd:dateTime.
                }
            }
            `
            query(q)
                .then(() => {
                    console.log(`Adding push update for ${id} worked`)
                })
                .catch((error) => {
                    console.error(error)
                })
        }
        let resourceUrl = e.event.value;
        if (deleteAfterConsumption) {
            q = `
            WITH <http://mu.semte.ch/application>
            DELETE
                {?s ?p ?o}
            WHERE {
                FILTER (?s = <${resourceUrl}> )
                ?s ?p ?o
            }`
            query(q)
                .then(() => {
                    console.log(`Deleting ${resourceUrl} from database worked`)
                })
                .catch((error) => {
                    console.error(error)
                })
        }
    }
}

// Function to generate a string key for a cache-clear event
function getKeyForEvent(path, method, urlQuery, muAuthAllowedGroups, muAuthUsedGroups) {
    return `${method} ${path}?${urlQuery}`
}

// Subscribing to a cache-clear given method, path and query
app.post('/cache-clear/', async function(req, res) {
    // Subscribe the given id to a certain key
    let id = req.get("MU-TAB-ID");
    let path = req.body.path
    let method = req.body.method
    let urlQuery = req.body.query
    let key = getKeyForEvent(path, method, urlQuery, "", "")

    if (cacheSubscriptions[key] === undefined) {
        cacheSubscriptions[key] = new Set()
    }
    cacheSubscriptions[key].add(id)
    res.status(204).send()
})
// Cancel subscription
app.delete('/cache-clear/', async function(req, res) {
    // Unsubscribe the given id to a certain key
    let id = req.get("MU-TAB-ID");
    let path = req.body.path
    let method = req.body.method
    let urlQuery = req.body.query
    let key = getKeyForEvent(path, method, urlQuery, "", "")

    if (cacheSubscriptions[key] !== undefined) {
        cacheSubscriptions[key].delete(id)
    }
    res.status(204).send()
})

// When delta messages are received in means there're new cache-clear events in the database
app.post('/.mu/delta', async function(req, res) {
    console.log("Got delta")
    res.status(204).send()
    generatePushUpdates()
})
