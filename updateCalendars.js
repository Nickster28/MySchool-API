const Parse = require("parse/node");
const request = require("request");


/* FUNCTION: updateCalendars
-----------------------------
Parameters:
	serverURL - the URL to request calendar data from.

Returns: a promise that sends requests to the given URL to update our school
calendar and athletics calendar data on Parse.  For the school calendar, we
replace all existing data with the updated data.  For the athletics calendar,
we do a diff on existing events and, if we see an updat, or if an event is
removed, we send a push notification to anyone who's subscribed to that team's
channel on Parse.
-----------------------------
*/
function updateCalendars(serverURL) {
	updateSchoolCalendar(serverURL).then(function() {
		return updateAthleticsCalendar(serverURL);
	}).then(function() {
		console.log("Calendars updated!");
	}, function(error) {
		console.log("An error occurred: " + JSON.stringify(error));
	});
}


/* FUNCTION: updateSchoolCalendar
----------------------------------
Parameters:
	serverURL - the URL to request school calendar data from.

Returns: a promise that sends a request to the given URL to update our school
calendar data on Parse.  We replace all existing school calendar data with the
updated data.
----------------------------------
*/
function updateSchoolCalendar(serverURL) {
	return getURL(serverURL + "/schoolCalendar").then(function(responseBody) {
		return JSON.parse(responseBody);
	}).then(function(calendarData) {
		const oldCalendarQuery = new Parse.Query("CalendarEvent");
		oldCalendarQuery.limit(1000);
		return oldCalendarQuery.find().then(function(oldCalendarEvents) {
			return Parse.Object.destroyAll(oldCalendarEvents);
		}).then(function() {
			return createNewCalendarEvents(calendarData);
		});
	});
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


/* FUNCTION: createNewCalendarEvents
-------------------------------------
Parameters:
	calendarData - an array of calendar objects to make into Parse CalendarEvent
					objects.

Returns: a promise that saves new CalendarEvent objects for each element in
the calendarData array.  Saves all objects to the server in parallel.
-------------------------------------
*/
function createNewCalendarEvents(calendarData) {
	const CalendarEvent = Parse.Object.extend("CalendarEvent");

	return Parse.Promise.when(calendarData.map(function(eventData) {
		// Create a new CalendarEvent Parse object
		const calendarEvent = new CalendarEvent();
		calendarEvent.set("eventName", eventData.eventName);
		calendarEvent.set("startDateTime", new Date(eventData.startDateTime));
		if (eventData.endDateTime) {
			calendarEvent.set("endDateTime", new Date(eventData.endDateTime));
		}
		if (eventData.location) {
			calendarEvent.set("location", eventData.location);
		}

		return calendarEvent.save();
	}));
}


// TODO
function updateAthleticsCalendar(serverURL) {
	return Parse.Promise.as(true);
}


if (!process.env.SERVER_URL) process.env.SERVER_URL = "http://localhost:1337";
Parse.initialize(process.env.APP_ID);
Parse.serverURL = process.env.SERVER_URL + "/parse";
const calendarServerURL = process.env.CALENDAR_SERVER_URL;
updateCalendars(calendarServerURL);

