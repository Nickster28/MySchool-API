var express = require('express');
var ParseServer = require('parse-server').ParseServer;
var ParseDashboard = require('parse-dashboard');
var path = require('path');

// Serve the Parse API on the /parse URL prefix
var mountPath = process.env.PARSE_MOUNT || '/parse';

var api = new ParseServer({
  	databaseURI: process.env.MONGODB_URI || '',
  	cloud: process.env.CLOUD_CODE_MAIN || __dirname + '/cloud/main.js',
  	appId: process.env.APP_ID || '',
  	masterKey: process.env.MASTER_KEY || '',
  	serverURL: (process.env.SERVER_URL || 'http://localhost:1337') + mountPath
});

var dashboardSettings = process.env.PARSE_DASHBOARD_CONFIG;
dashboardSettings.trustProxy = 1;
var dashboard = new ParseDashboard(dashboardSettings);

var app = express();

// Serve static assets from the /public folder
app.use('/public', express.static(path.join(__dirname, '/public')));

app.use(mountPath, api);

app.use('/dashboard', dashboard);

// Parse Server plays nicely with the rest of your web routes
app.get('/', function(req, res) {
  	res.status(200).send('Hello world!');
});


var port = process.env.PORT || 1337;
var httpServer = require('http').createServer(app);
httpServer.listen(port, function() {
  	console.log('API running on port ' + port + '.');
});

