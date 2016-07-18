# MyMaret-API
API for the MyMaret app.  To start, run

`npm start`

###Expects the following environment variables:
- ** APP_ID ** - Parse Server App ID to use
- ** MASTER_KEY ** - Parse Server Master Key to use
- ** MONGODB_URI ** - URL of the MongoDB instance to use
- ** (OPTIONAL) SERVER_URL ** - the URL this server is running from (defaults to http://localhost:1337)
- ** (OPTIONAL) PARSE_MOUNT ** - the path the Parse Server is running from (defaults to /parse)
- ** (OPTIONAL) CLOUD_CODE_MAIN ** - the path to the main Parse Cloud Code file (defaults to /cloud/main.js)
- ** (OPTIONAL) PORT ** - the port to run from (defaults to 1337)

 ### Testing and Debugging
 Optionally, you can run additional API server configurations with different debugging options.  These configurations are all run using the runLocal.js script, which requires a `serverInfo.json` file to be in the same directory, with the following structure:

 `
 {
	"staging": {
		"appID": "YOUR_STAGING_APP_ID_HERE",
		"masterKey": "YOUR_STAGING_MASTER_KEY_HERE",
		"mongoUri": "YOUR_STAGING_MONGODB_URL_HERE"
	},
	"prod": {
		"appID": "YOUR_PRODUCTION_APP_ID_HERE",
		"masterKey": "YOUR_PRODUCTION_MASTER_KEY_HERE",
		"mongoUri": "YOUR_PRODUCTION_MONGODB_URL_HERE"
	}
 }
 `

runLocal.js takes care of all of the required environment variables for you using `serverInfo.json`.  It also allows you to run a MyMaret-API instance locally, using different debug options, while connecting to the same remote database that the hosted staging and prod instances connect to.  There are premade npm scripts that allow you to run these various configurations:
- ** npm run start:prod ** - runs locally with the prod APP_ID and MASTER_KEY, and connects to the hosted prod database
- ** npm run start:staging ** - runs locally with the staging APP_ID and MASTER_KEY, and connects to the hosted staging database
- ** npm run debug:prod ** - same as `npm run start:prod`, but runs with `node-debug` instead of `node` to launch a debugger
- ** npm run debug:staging ** - same as `npm run start:staging`, but runs with `node-debug` instead of `node` to launch a debugger
- ** npm run test:prod ** - same as `npm run start:prod`, but runs with `nodemon` instead of `node` to live-reload the server after any file changes
- ** npm run test:staging ** - same as `npm run start:staging:`, but runs with `nodemon` instead of `node` to live-reload the server after any file changes

### `runLocal.js` Details
The `runLocal.js` script takes 1 or two arguments:

`runLocal.js SERVER_NAME DEBUG_OPTION`

- ** (REQUIRED) SERVER_NAME ** - must match a key in `serverInfo.json`, which must map to an object containing "appID", "masterKey", and "mongoUri" fields (see `serverInfo.json` format above).
- ** (OPTIONAL) DEBUG_OPTION ** - either "debugger" or "instant-reload".  "debugger" runs using `node-debug` instead of `node`, which launches a debugger window.  "instant-reload" runs using `nodemon` instead of `node`, which auto-relaunches the server whenever a file changes.