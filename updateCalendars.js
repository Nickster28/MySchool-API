/* FILE: updateCalendars
-------------------------
Polls the given calendar server and updates school calendar and athletics
calendar data in Parse with the result.  Overwrites all school calendar events
with the new data, and diffs athletics event data to send alerts about event
changes.
-------------------------
*/


const Parse = require("parse/node");
const request = require("request");


const AthleticsEvent = Parse.Object.extend("AthleticsEvent");
const CalendarEvent = Parse.Object.extend("CalendarEvent");


/* FUNCTION: updateCalendars
-----------------------------
Parameters:
	serverURL - the URL to request calendar data from.

Returns: a promise that sends requests to the given URL to update our school
calendar and athletics calendar data on Parse.  For the school calendar, we
replace all existing data with the updated data.  For the athletics calendar,
we do a diff on existing events and, if we see an updat, we send a push
notification to anyone who's subscribed to that team's
channel on Parse.
-----------------------------
*/
function updateCalendars(serverURL) {
	updateSchoolCalendar(serverURL).then(function() {
		return updateAthleticsCalendar(serverURL);
	}).then(function() {
		console.log("Calendars updated!");
	}, function(error) {
		console.log("An error occurred: " + error.stack);
	});
}


/* FUNCTION: updateSchoolCalendar
----------------------------------
Parameters:
	serverURL - the URL to request school calendar data from. (/schoolCalendar)

Returns: a promise that sends a request to the given URL to update our school
calendar data on Parse.  We replace all existing school calendar data with the
updated data.
----------------------------------
*/
function updateSchoolCalendar(serverURL) {
	return getURL(serverURL + "/schoolCalendar").then(function(responseBody) {
		return JSON.parse(responseBody);
	}).then(function(calendarData) {
		Parse.Cloud.useMasterKey();
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


/* FUNCTION: updateAthleticsCalendar
----------------------------------
Parameters:
	serverURL - the URL to request athletics calendar data from.
				(/athleticsCalendar)

Returns: a promise that sends a request to the given URL to update our athletics
calendar data on Parse.  We do a diff on our existing athletics events to check
for updates to those events, and if we see an update to the time or status,
we send a push notification for anyone who's subscribed to that team's channel.
----------------------------------
*/
function updateAthleticsCalendar(serverURL) {
	return getURL(serverURL + "/athleticsCalendar").then(function(response) {
		return JSON.parse(response);
	}).then(function(calendarData) {
		return updateAthleticsEvents(calendarData.games, true).then(function() {
			return updateAthleticsEvents(calendarData.practices, false);
		});
	});
}


/* FUNCTION: updateAthleticsEvents
-----------------------------------
Parameters:
	eventsData - an array of event objects containing current athletics event
				information to update the server with.
	areGames - whether or not the events in eventsData are games or practices.

Returns: a promise that updates all athletics games and practices in the
database with the current data, and sends out push notifications to any
subscribed users if any event time or status changes.

NOTE: assumes at most one game and practice per team per day.  Otherwise, it
would be very tricky to track events if they move to a new time.  If, in the
fetched data, there are multiple games or multiple practices for a team on a
given day, only the first one is used.  Similarly, we assume that an event's
DATE does not change (since there would be no easy way to identify an event
across date changes).
-----------------------------------
*/
function updateAthleticsEvents(eventsData, areGames) {
	const updateStart = new Date();

	Parse.Cloud.useMasterKey();
	console.log("Updating " + (areGames ? "games..." : "practices..."));
	var numChanged = 0;
	var numNew = 0;

	// Sequentially check each event in eventsData
	var promise = Parse.Promise.as();
	eventsData.forEach(function(eventData) {
		promise = promise.then(function() {
			return fetchAthleticsEventForEventData(eventData, areGames);
		}).then(function(event) {
			// See if an event is new or if it's already been added
			const alreadyExists = event ? true : false;
			if (event) {
				// If the colliding event was already touched this round,
				// the event data we're looking at should be ignored
				if (event.updatedAt > updateStart) {
					return Parse.Promise.as();
				}

				// Otherwise, diff it against the new data
				const changed = diffAthleticsEvent(event, eventData, areGames);
				if (changed) {
					console.log("Event \"" + event.get("hashCode") +
						"\" (" + event.id + ") updated");
					console.log(JSON.stringify(eventData));
					numChanged += 1;
				}
			} else {
				event = newAthleticsEventFromEventData(eventData, areGames);
				numNew += 1;
			}

			// Only add it to a team if it's a new event
			var returnedPromise = event.save();
			if (!alreadyExists) {
				returnedPromise = returnedPromise.then(function(savedEvent) {
					return addEventToTeam(eventData.team, savedEvent, areGames);
				});
			}
			
			return returnedPromise;
		});
	});

	// Print out statistics at the end
	return promise.then(function() {
		console.log("Done updating " + (areGames ? "games" : "practices"));
		console.log("# Changed: " + numChanged);
		console.log("# New: " + numNew);
		console.log("Total: " + eventsData.length);
	});
}


/* FUNCTION: fetchAthleticsEventForEventData
----------------------------------------------------
Parameters:
	eventData - the event data object to attempt to fetch an AthleticsEvent for
	isGame - whether the given event data is for a game or practice

Returns: a promise passing back an AthleticsEvent already in our database for
the given eventData, if any.  The lookup is done using the event's hashCode.
----------------------------------------------------
*/
function fetchAthleticsEventForEventData(eventData, isGame) {
	const eventQuery = new Parse.Query("AthleticsEvent");
	const hashCode = hashAthleticsEventWithData(eventData, isGame);
	eventQuery.equalTo("hashCode", hashCode);
	return eventQuery.first();
}


/* FUNCTION: hashAthleticsEventWithData
----------------------------------------
Parameters:
	eventData - the event data object to hash
	isGame - whether or not the given event data is for a game or for a practice

Returns: a unique hashcode representing this event; the hashcode is calculated
as follows:

	TEAM_NAME:[game/practice]:MONTH-DATE-YEAR

This hashcode is guaranteed to be unique under the assumption that there is at
most one game and one practice per athletics team per day, and that an event's
DATE does not change (since there would be no easy way to identify an event
across date changes).
----------------------------------------
*/
function hashAthleticsEventWithData(eventData, isGame) {
	const date = new Date(eventData.startDateTime);
	const dateString = date.getMonth() + "-" + date.getDate() + "-"
		+ date.getFullYear();
	return eventData.team + ":" + (isGame ? "game:" : "practice:") + dateString;
}


/* FUNCTION: diffAthleticsEvent
-------------------------------
Parameters:
	event - the AthleticsEvent object already in our database
	eventData - the event object to diff against
	isGame - whether or not the given events are for a game or practice

Returns: whether the event's status or time changed

Checks the eventData against the existing event and, if the status field or the
event TIME (hours/minutes) have changed, sends out an alert to all users
subscribed to notifications for this team.  Note that the event DATE cannot
change since we are assuming the date is a uniquely identifying element of an
event.  UPDATES the status/startDateTime fields in |event| if there is a change.
-------------------------------
*/
function diffAthleticsEvent(event, eventData, isGame) {
	var didChange = false;
	// If the event status changed...
	if (event.get("status") != eventData.status) {
		sendAlertForTeam(eventData.team, "status", eventData.status, isGame,
			event.get("startDateTime"));
		event.set("status", eventData.status);
		didChange = true;
	}

	// If the event TIME changed... (date can't change)
	if (event.get("startDateTime").toJSON() != eventData.startDateTime) {
		const newDate = new Date(eventData.startDateTime);

		var newHour = newDate.getHours();
		const ampm = newHour >= 12 ? "PM" : "AM";
		newHour = newHour % 12;
		if (newHour == 0) newHour = 12;
		const newMinute = newDate.getMinutes();
		const newMinuteString = newMinute < 10 ? "0" + newMinute : newMinute;

		const newTimeString = newHour + ":" + newMinuteString + ampm;
		sendAlertForTeam(eventData.team, "time", newTimeString, isGame,
			event.get("startDateTime"));
		event.set("startDateTime", new Date(eventData.startDateTime));
		didChange = true;
	}

	return didChange;
}


/* FUNCTION:newAthleticsEventFromEventData
-------------------------------------------
Parameters:
	eventData - the data to make a new AthleticsEvent object out of
	isGame - whether or not the event we're making is a game or practice

Returns: a new AthleticsEvent object made out of the given eventData.  An
AthleticsEvent has the following fields:

	hashCode - unique string identifying this element
	startDateTime - date object representing when the event starts
	isHome - whether or not the event is a home event (games only)
	opponent - name of the opponent (games only)
	location - name of the location
	result - "Win" or "Loss" or other game result string (games only)
	status - status messages like "CANCELLED"

-------------------------------------------
*/
function newAthleticsEventFromEventData(eventData, isGame) {
	const event = new AthleticsEvent();
	event.set("hashCode", hashAthleticsEventWithData(eventData, isGame));
	event.set("startDateTime", new Date(eventData.startDateTime));
	if (eventData.isHome == true || eventData.isHome == false) {
		event.set("isHome", eventData.isHome);
	}

	if (eventData.opponent) {
		event.set("opponent", eventData.opponent);
	}

	if (eventData.location) {
		event.set("location", eventData.location);
	}

	if (eventData.result) {
		event.set("result", eventData.result);
	}

	if (eventData.status) {
		event.set("status", eventData.status);
	}

	return event;
}


/* FUNCTION: sendAlertForTeam
------------------------------
Parameters:
	team - the name of the team for which to send an alert
	fieldChanged - the name of the field that changed
	newValue - the updated value for this field
	isGame - whether or not the changed event was a game or practice
	date - the original date of this event

Returns: NA

TODO: Sends a notification to all users subscribed to this team that the given
field in this event changed to the given new value.
------------------------------
*/
function sendAlertForTeam(team, fieldChanged, newValue, isGame, date) {
	const dateString = (date.getMonth() + 1) + "/" + date.getDate();
	const eventType = isGame ? "game" : "practice";
	console.log(team + " " + eventType + " on " + dateString + ": "
		+ fieldChanged + " changed to " + newValue + ".");
}


/* FUNCTION: addEventToTeam
----------------------------
Parameters:
	teamName - the name of the team to add the given event to
	event - the event to add
	isGame - whether the given event is a game or practice

Returns: a promise that adds the given event to either the given team's games
or practices array, depending on whether the event is a game or practice.
----------------------------
*/
function addEventToTeam(teamName, event, isGame) {
	const teamQuery = new Parse.Query("AthleticsTeam");
	teamQuery.equalTo("teamName", teamName);
	return teamQuery.first().then(function(team) {
		if (isGame) {
			team.set("games", team.get("games").concat([event]));
		} else {
			team.set("practices", team.get("practices").concat([event]));
		}
		return team.save();
	});
}


if (!process.env.SERVER_URL) process.env.SERVER_URL = "http://localhost:1337";
Parse.initialize(process.env.APP_ID, null, process.env.MASTER_KEY);
Parse.serverURL = process.env.SERVER_URL + "/parse";
const calendarServerURL = process.env.CALENDAR_SERVER_URL;
updateCalendars(calendarServerURL);

