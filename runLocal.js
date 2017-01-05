/* FILE: runLocal.js
----------------------
Runs different configurations of the MySchool-API.  Relies on a companion
runLocal.json file with the server info in the following format:

{
	"configs": {
		...
	},
	"dashboard": {
		...
	},
	"googleClientId": "adsfwerqwet",	// example
	"schoolDomain": "myschool.org"	// example
}

where "configs" maps to a dictionary of server names to server config objects,
and "dashboard" maps to a Parse Dashboard config object as a JSON string.
Each config object must have an "appId", "masterKey", "calendarServerUrl" and
"mongoUri" field.

With this companion file, this script takes 1-2 command line arguments:

	node runLocal.js FILE_NAME SERVER_NAME DEBUG_OPTION

- (REQUIRED) FILE_NAME - the name of the file to run
- (REQUIRED) SERVER_NAME - must match a configuration object in "configs" above.
Runs that server configuration.
- (OPTIONAL) DEBUG_OPTION - if "debug", runs using node-debug instead of the
default nodemon.
----------------------
*/

var execSync = require("child_process").execSync;
var fs = require("fs");
var serverInfo = JSON.parse(fs.readFileSync("runLocal.json", "utf8"));


/* FUNCTION: argsStringForServerName
----------------------------------------
	Parameters:
		serverName - name of the server to create a string for

Returns: the command line string needed to start parse server.
 		Format: "APP_ID={APP_ID} MASTER_KEY={MASTER_KEY} MONGODB_URI={URI} 
				CALENDAR_SERVER_URL={URL} DASHBOARD_CONFIG={JSON_STRING}
				GOOGLE_CLIENT_ID={ID} SCHOOL_DOMAIN={DOMAIN}"
----------------------------------------
*/
function argsStringForServerName(serverName) {
	var selectedServerInfo = serverInfo.configs[serverName];
	if (!selectedServerInfo) return null;

	return 'APP_ID=\"' + selectedServerInfo.appId + '\" MASTER_KEY=\"' +
		selectedServerInfo.masterKey + '\" MONGODB_URI=\"' +
		selectedServerInfo.mongoUri + '\" CALENDAR_SERVER_URL=\"' + 
		selectedServerInfo.calendarServerUrl + '\" DASHBOARD_CONFIG=\'' +
		JSON.stringify(serverInfo.dashboard) + '\' GOOGLE_CLIENT_ID="' +
		serverInfo.googleClientId + '\" SCHOOL_DOMAIN=\"' + 
		serverInfo.schoolDomain + '\"';
}


// Ignore the first 2 'node' and process name args
var args = process.argv.slice(2)

var argsString = argsStringForServerName(args[1]);
if (!argsString) {
	console.error("Error: invalid server name");
} else {
	var command = args[2] == "debug" ? "node-debug" : "nodemon";
	execSync(argsString + " " + command + " " + args[0], {stdio:[0,1,2]});
}
