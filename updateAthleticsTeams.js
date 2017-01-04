/* FILE: updateAthleticsTeams
-------------------------
Polls the given calendar server for a list of athletics teams and updates Parse
with the result.  Overwrites all existing teams with the result.
-------------------------
*/


const Parse = require("parse/node");
const request = require("request");


/* FUNCTION: updateAthleticsTeams
---------------------------------
Parameters:
	serverURL - the URL to request athletics team information from
				(/athleticsTeams)

Returns: a promise that deletes all existing AthleticsTeam objects from Parse
and replaces them with new teams created from calendar server data.
Specifically, this method sends a request to /athleticsTeams for information on
athletics teams for each season.
---------------------------------
*/
function updateAthleticsTeams(serverURL) {
	return getURL(serverURL + "/athleticsTeams").then(function(responseBody) {
		return JSON.parse(responseBody);
	}).then(function(athleticsData) {
		const oldTeamsQuery = new Parse.Query("AthleticsTeam");
		oldTeamsQuery.limit(1000);
		return oldTeamsQuery.find({
			useMasterKey: true
		}).then(function(oldTeams) {
			return Parse.Object.destroyAll(oldTeams, {useMasterKey: true});
		}).then(function() {
			return createNewAthleticsTeams(athleticsData);
		});
	}).then(function() {
		console.log("Athletics teams updated!");
	}, function(error) {
		console.log("An error occurred: " + JSON.stringify(error));
		console.log(error.stack);
	});
}


/* FUNCTION: createNewAthleticsTeams
------------------------------------
Parameters:
	athleticsData - a map from season names to lists of athletics team names
					for that season.  This method creates a new AthleticsTeam 
					for each listed team.

Returns: a promise that creates a new AthleticsTeam object for each team name
contained within athleticsData.  Each AthleticsTeam can only be read by the
any Student (and not written by anyone) and has the following fields:

- teamName
- practices (list of AthleticsEvent objects)
- games (list of AthleticsEvent objects)
- season (name of season - e.g. "Fall")
------------------------------------
*/
function createNewAthleticsTeams(athleticsData) {
	const AthleticsTeam = Parse.Object.extend("AthleticsTeam");
	var teams = [];
	Object.keys(athleticsData).forEach(function(seasonName) {
		const seasonTeams = athleticsData[seasonName].map(function(teamName) {
			const athleticsTeam = new AthleticsTeam();
			athleticsTeam.set("teamName", teamName);
			athleticsTeam.set("practices", []);
			athleticsTeam.set("games", []);
			athleticsTeam.set("season", seasonName);
			return athleticsTeam;
		});
		teams = teams.concat(seasonTeams);
	});

	return Parse.Object.saveAll(teams, {useMasterKey: true});
}


/* FUNCTION: getURL
--------------------------
Parameters:
    url - the url to GET

Returns: a promise containing the GET response from the given url

Uses "request" within a promise.  If there's an error, the
error will be passed back in a promise.  Otherwise, the response
is passed back.
--------------------------
*/
function getURL(url) {
    "use strict";
    return new Promise(function(resolve, reject) {
        request(url, function(error, response, body) {
            if(error) reject(error);
            else resolve(body);
        });
    });
}


if (!process.env.SERVER_URL) process.env.SERVER_URL = "http://localhost:1337";
Parse.initialize(process.env.APP_ID, null, process.env.MASTER_KEY);
Parse.serverURL = process.env.SERVER_URL + "/parse";
const calendarServerURL = process.env.CALENDAR_SERVER_URL;
updateAthleticsTeams(calendarServerURL);

