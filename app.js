import {
    app,
    query,
    sparqlEscape
} from "mu";
import bodyParser from "body-parser";
let sort = process.env.PUSH_UPDATES_SORTING_METHOD || "" // must be "ASC" or "DESC" all other values are interpreted as falsy (no sorting)
let refreshTimeout = process.env.PUSH_UPDATES_REFRESH_TIMEOUT || 10;
let maxTimeout = process.env.PUSH_UPDATES_MAX_TIMEOUT || 80; // in seconds
let maxRetrySparql = maxTimeout * 1000 / refreshTimeout - 10;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
app.use(bodyParser.json());

let cacheClearsReady = 1;

app.get('/cache-clear/', async function(req, res) {
    while (!cacheClearsReady && retry < maxRetrySparql) {
        await sleep(refreshTimeout)
        retry++
    }
    let q = `
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
        PREFIX mucache: <http://mu.semte.ch/vocabularies/cache/>
        PREFIX dc:  <http://purl.org/dc/terms/>
        SELECT ?event
        WHERE {
          GRAPH <http://mu.semte.ch/application> {
            ?event a mucache:CacheClear.
          }
        }`;
    let response = await query(q);
    console.log(JSON.stringify(response));
})