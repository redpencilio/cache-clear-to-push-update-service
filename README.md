# Cache-clear consumption service

This service will transform cache-clear events to push-updates for each tab that is subscribed to a certain resource (path, method and query)

Subscribing to a resource is done using the subscribe API:


## POST /cache-clear/

This will subscribe the currect tab (defined my MU-TAB-ID) to a certain resource, the resource is defined a body like this:
```
{
    path: <the path of the subscription>,
    query: <the query of the subscription>,
    method: <the method of the subscription>
}
```

## DELETE /cache-clear/

This will unsubscribe the currect tab (defined my MU-TAB-ID) to a certain resource, the resource is defined a body like this:
```
{
    path: <the path of the subscription>,
    query: <the query of the subscription>,
    method: <the method of the subscription>
}
```


The format of a cache-clear is defined in [this file](./model.md)

This service needs delta messages from the [delta notifier](https://github.com/mu-semtech/delta-notifier) in the `v0.0.1` [format](https://github.com/mu-semtech/delta-notifier#delta-formats), with an object filter for mucache:CacheClear.
