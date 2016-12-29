const Parse = require("parse/node");


function updateCalendars(serverURL) {
	updateSchoolCalendar(serverURL).then(function() {
		return updateAthleticsCalendar(serverURL);
	}).then(function() {
		console.log("Calendars updated!");
	}, function(error) {
		console.log("An error occurred: " + JSON.stringify(error));
	});
}


function updateSchoolCalendar(serverURL) {
	return Parse.Promise.as(true);
}


function updateAthleticsCalendar(serverURL) {
	return Parse.Promise.as(true);
}


Parse.initialize(process.env.APP_ID);
Parse.serverURL = process.env.SERVER_URL + "/parse";
const calendarServerURL = process.env.CALENDAR_SERVER_URL;
updateCalendars(calendarServerURL);