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

let cacheClearsReady = 0;

// TODO: keep map of key (url, method etc... match) -> list of tab id's

// Map from key (format from getKeyForEvent ) to list of tabId's which are subscribed to that key
let cacheSubscriptions = {}


async function generatePushUpdates() {
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
    for (let e of response.results.bindings) {
        /*
         * TODO: for each of the results do the following
         *  - check for a match with key
         *  - then generate push updates for each of the tab id's
         *  - delete after consumption
         */
        console.log(JSON.stringify(e))

        let path = e.path.value;
        let method = e.method.value;
        let urlQuery = e.query.value;
        let muAuthAllowedGroups = e.muAuthAllowedGroups.value;
        let muAuthUsedGroups = e.muAuthUsedGroups.value;

        let key = getKeyForEvent(path, method, urlQuery, muAuthAllowedGroups, muAuthUsedGroups)
        console.log(key)

        console.log(cacheSubscriptions[key])
        console.log(cacheSubscriptions)
        let tabIdList = cacheSubscriptions[key] || []
        let now = new Date()
        let dateISOString = now.toISOString()
        let type = "http://cache-clear-event"
        let realm = "http://cache"
        for (let id of tabIdList) {
            let value = sparqlEscape(JSON.stringify({path: path, method: method, query: urlQuery}), 'string')
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

function getKeyForEvent(path, method, urlQuery, muAuthAllowedGroups, muAuthUsedGroups) {
    return `${method} ${path}?${urlQuery}`
}

// Subscribing to a cache-clear given method, path and query
app.post('/cache-clear/', async function(req, res) {
    console.log(req.body)
    let id = req.get("MU-TAB-ID");
    let path = req.body.path
    let method = req.body.method
    let urlQuery = req.body.query
    let key = getKeyForEvent(path, method, urlQuery, "", "")

    if (cacheSubscriptions[key] === undefined) {
        cacheSubscriptions[key] = new Set()
    }
    cacheSubscriptions[key].add(id)
    console.log(key)
    console.log(cacheSubscriptions[key])

    res.status(204).send()
})
// Cancel subscription
app.delete('/cache-clear/', async function(req, res) {
    console.log(req.body)
    let id = req.get("MU-TAB-ID");
    let path = req.body.path
    let method = req.body.method
    let urlQuery = req.body.query
    let key = getKeyForEvent(path, method, urlQuery, "", "")

    if (cacheSubscriptions[key] !== undefined) {
        console.log(cacheSubscriptions[key])
        cacheSubscriptions[key].delete(id)
        console.log(cacheSubscriptions[key])
    }
    res.status(204).send()
})


app.post('/.mu/delta', async function(req, res) {
    console.log("Got delta")
    res.status(204).send()
    generatePushUpdates()
})
