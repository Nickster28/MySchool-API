# MySchool-API
API for the MySchool app.  To start, run `npm install` to install all necessary
packages, and then run

`npm start`

The server expects the following environment variables:

- **APP_ID** - Parse Server App ID to use
- **MASTER_KEY** - Parse Server Master Key to use
- **MONGODB_URI** - URL of the MongoDB instance to use

The server also accepts additional optional environment variables:

- **DASHBOARD_CONFIG** - optional stringified JSON object to configure the
[Parse Dashboard](https://github.com/ParsePlatform/parse-dashboard)
(see its GitHub docs for more info).  If this variable is specified, a Parse
Dashboard is mounted at /dashboard.
- **SERVER_URL** - the URL this server is running from
(defaults to http://localhost:1337)
- **PORT** - the port to run from (defaults to 1337)

## Testing and Debugging
It's also easy to run different server configurations and debugging options
using the runLocal.js file.  This file relies on a companion runLocal.json file
with the server info in the following format:

```javascript
{
	"configs": {
		// config object map
	},
	"dashboard": {
		// dashboard config
	}
}
```

where "configs" maps to a dictionary of server names to server config objects,
and "dashboard" maps to a Parse Dashboard config object as a JSON string.
Each config object must have an "appId", "masterKey", and "mongoUri" field.

With this companion file, this script takes 1-2 command line arguments:

```javascript
	node runLocal.js SERVER_NAME DEBUG_OPTION
```

- **SERVER_NAME** - must match a configuration object in "configs" above.
Runs that server configuration.
- **DEBUG_OPTION** - if "debug", runs using node-debug instead of the
default nodemon.  Optional.

The included package.json file relies on runLocal.js to run various server
configurations.  Take a look to see what different npm commands are built in.

## Additional Tidbits
There is a `commitAndPushAll.sh` script included, which if run, will commit and
push the entered file changes to both staging and master.  It will ask for a
commit message on launch.  Note that you will need to add any untracked files
before running this script.