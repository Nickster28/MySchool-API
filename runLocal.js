var execSync = require('child_process').execSync;
var fs = require('fs');
var serverInfo = JSON.parse(fs.readFileSync('serverInfo.json', 'utf8'));

/* FUNCTION: serverArgsStringForServerName
 * ----------------------------------------
 * Parameters:
 * 		serverName - name of the server to create a string for
 *
 * Returns: the command line string needed to start parse server.
 * 		Format: "APP_ID={APP_ID} MASTER_KEY={MASTER_KEY} MONGODB_URI={URI}"
 * ----------------------------------------
 */
function serverArgsStringForServerName(serverName) {
	var selectedServerInfo = serverInfo[serverName];
	if (!selectedServerInfo) return null;

	return 'APP_ID=\"' + selectedServerInfo.appId + '\" MASTER_KEY=\"' +
		selectedServerInfo.masterKey + '\" MONGODB_URI=\"' +
		selectedServerInfo.mongoUri + '\"';
}

/* FUNCTION: commandForServerOption
 * ---------------------------------
 * Parameters:
 * 		serverOption - name of the option to use when starting the server
 *
 * Returns: name of the command line command to run for this option.  Options
 *	currently include 'debugger' and 'instant-reload', or none.
 */
 function commandForServerOption(serverOption) {
 	if (serverOption == null) {
 		return "node";
 	} else if (serverOption == "instant-reload") {
		return "nodemon";
	} else if (serverOption == "debugger") {
		return "node-debug";
	} else {
		return null;
	}
 }

// Ignore the first 2 'node' and process name args
var args = process.argv.slice(2)

var argsString = serverArgsStringForServerName(args[0]);
if (!argsString) {
	console.error("Error: invalid server name");
} else {
	var command = commandForServerOption(args[1]);
	if (!command) {
		console.error("Error: invalid server option");
	} else {
		execSync(argsString + " " + command + " " + "server.js", {stdio:[0,1,2]});
	}
}
