/* FILE: updateCalendars
-------------------------
Polls the given calendar server and updates school calendar and athletics
calendar data in Parse with the result.  Overwrites all school calendar events
with the new data, and diffs athletics event data to send alerts about event
changes.  Removes athletics events not part of the updated data.
-------------------------
*/


const Parse = require("parse/node");
const request = require("request");


const AthleticsEvent = Parse.Object.extend("AthleticsEvent");
const CalendarEvent = Parse.Object.extend("CalendarEvent");
const ParseError = Parse.Object.extend("ParseError");


/* FUNCTION: updateCalendars
-----------------------------
Parameters:
	serverURL - the URL to request calendar data from.

Returns: a promise that sends requests to the given URL to update our school
calendar and athletics calendar data on Parse.  For the school calendar, we
replace all existing data with the updated data.  For the athletics calendar,
we do a diff on existing events and, if we see an update, we send a push
notification to anyone who's subscribed to that team's channel on Parse.

For any errors, creates a ParseError object in Parse with the error's info.
-----------------------------
*/
function updateCalendars(serverURL) {
	updateSchoolCalendar(serverURL).then(function() {
		return updateAthleticsCalendar(serverURL);
	}).then(function() {
		console.log("Calendars updated!");
	}, function(error) {
		console.log("An error occurred: " + JSON.stringify(error));
		console.log(error.stack);

		// Save the error in the database to address later
		var e = new ParseError();
		e.set("source", "updateCalendars.js");
		e.set("stackTrace", error.stack);
		e.set("error", JSON.stringify(error));
		e.save(null, {useMasterKey: true});
	});
}


/* FUNCTION: updateSchoolCalendar
----------------------------------
Parameters:
	serverURL - the URL to request school calendar data from. (/schoolCalendar)

Returns: a promise that sends a request to the given URL to update our school
calendar data on Parse.  We replace all existing school calendar data with the
updated data.

Requires Master Key usage to access locked down CalendarEvent objects.
----------------------------------
*/
function updateSchoolCalendar(serverURL) {
	return getURL(serverURL + "/schoolCalendar").then(function(responseBody) {
		return JSON.parse(responseBody);
	}).then(function(calendarData) {
		const oldCalendarQuery = new Parse.Query("CalendarEvent");
		oldCalendarQuery.limit(1000);
		console.log("Updating school calendar...");
		return oldCalendarQuery.find({
			useMasterKey: true
		}).then(function(oldCalendarEvents) {
			return Parse.Object.destroyAll(oldCalendarEvents, {
				useMasterKey: true
			});
		}).then(function() {
			console.log("Creating " + calendarData.length + " new events...");
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
the calendarData array.

Requires Master Key usage to create locked down CalendarEvent objects.
-------------------------------------
*/
function createNewCalendarEvents(calendarData) {
	const eventsToSave = calendarData.map(function(eventData) {
		const calendarEvent = new CalendarEvent();
		calendarEvent.set("eventName", eventData.eventName);
		calendarEvent.set("startDateTime", new Date(eventData.startDateTime));
		if (eventData.endDateTime) {
			calendarEvent.set("endDateTime", new Date(eventData.endDateTime));
		}
		if (eventData.location) {
			calendarEvent.set("location", eventData.location);
		}

		return calendarEvent;
	});
	return Parse.Object.saveAll(eventsToSave, {useMasterKey: true});
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
Removes any athletics events NOT in the updated data.
----------------------------------
*/
function updateAthleticsCalendar(serverURL) {
	return getURL(serverURL + "/athleticsCalendar").then(function(response) {
		return JSON.parse(response);
	}).then(function(calendarData) {
		return fetchExistingAthleticsEvents().then(function(existingEvents) {
			return Parse.Promise.as([existingEvents, calendarData]);
		});
	}).then(function(data) {
		const existingEvents = data[0];
		const games = data[1].games;
		const practices = data[1].practices;
		console.log("Received " + games.length + " games, " + practices.length + " practices");

		// Make a map from hashCodes to AthleticsEvents for existing events
		// This map is modified and returned by updateAthletisEvents below.
		const existingEventsMap = {};
		existingEvents.forEach(function(existingEvent) {
			const hashCode = existingEvent.get("hashCode");
			existingEventsMap[hashCode] = existingEvent;
		});

		// updateAthleticsEvents returns the portion of the existingEvents that
		// it DIDN'T touch.
		return updateAthleticsEvents(games, true, existingEventsMap)
			.then(function(remainingEventsMap) {
			
			return updateAthleticsEvents(practices, false, remainingEventsMap);
		});
	}).then(function(remainingEventsMap) {
		return removeRemainingAthleticsEvents(remainingEventsMap);
	});
}


/* FUNCTION: updateAthleticsEvents
-----------------------------------
Parameters:
	eventsData - an array of event objects containing current athletics event
				information to update the server with.
	areGames - whether or not the events in eventsData are games or practices.
	existingEventsMap - a map of existing events' hashcodes to the
						AthleticsEvents themselves.

Returns: a promise that updates all athletics games and practices in the
database with the current data, and sends out push notifications to any
subscribed users if any event time or status changes.  Returns a modified
existingEventsMap with only the events we didn't touch.

NOTE: assumes at most one game and practice per team per day.  Otherwise, it
would be very tricky to track events if they move to a new time.  If, in the
fetched data, there are multiple games or multiple practices for a team on a
given day, only the first one is used.  Similarly, we assume that an event's
DATE does not change (since there would be no easy way to identify an event
across date changes).

Requires Master Key usage to access locked down AthleticsEvent objects.
-----------------------------------
*/
function updateAthleticsEvents(eventsData, areGames, existingEventsMap) {
	console.log("Updating " + (areGames ? "games..." : "practices..."));
	var numChanged = 0;
	var numNew = 0;
	var numDuplicates = 0;

	// This set contains the hashCodes of all *new* events we've gone over
	// Vs. existingEventsMap, which is all *existing* events we haven't yet
	// gone over.
	const newEvents = new Set();

	// Sequentially check each event in eventsData
	var promise = Parse.Promise.as();
	eventsData.forEach(function(eventData) {
		promise = promise.then(function() {
			const hashCode = hashAthleticsEventWithData(eventData, areGames);
			var event = existingEventsMap[hashCode];

			// See if an event is new or if it's in the old database
			if (event) {
				// Clear this event since we looked at it
				delete existingEventsMap[hashCode];

				// Mark the event as seen
				newEvents.add(hashCode);

				// Diff it against the new data and update if needed
				const notificationPromise =
					diffAthleticsEvent(event, eventData, areGames);
				if (notificationPromise) {
					numChanged += 1;

					return event.save(null, {
						useMasterKey: true
					}).then(function() {
						return notificationPromise;
					});
				} else return Parse.Promise.as();
			} else if (!newEvents.has(hashCode)) {
				// If it's not in the old database AND not already in our new
				// data, add it.
				event = newAthleticsEventFromEventData(eventData, hashCode);
				numNew += 1;

				// Mark the event as seen
				newEvents.add(hashCode);

				// Add it to its appropriate team.
				return event.save(null, {
					useMasterKey: true
				}).then(function(savedEvent) {
					return addEventToTeam(eventData.team, savedEvent, areGames);
				});
			} else {
				// Otherwise it's not in the old database, but was added already
				numDuplicates += 1;
				return Parse.Promise.as();
			}
		});
	});

	// Print out statistics at the end
	return promise.then(function() {
		console.log("Done updating " + (areGames ? "games" : "practices"));
		console.log("# Changed: " + numChanged);
		console.log("# New: " + numNew);
		console.log("# Duplicates: " + numDuplicates);
		console.log("Total: " + eventsData.length);
	}).then(function() {
		// Return all events in the database we didn't touch
		return Parse.Promise.as(existingEventsMap);
	});
}


/* FUNCTION: fetchAthleticsEventForEventData
----------------------------------------------------
Parameters: NA

Returns: a promise passing back all existing AthleticsEvent objects in the
database.

Requires Master Key usage to access locked down AthleticsEvent objects.
----------------------------------------------------
*/
function fetchExistingAthleticsEvents() {
	const eventQuery = new Parse.Query("AthleticsEvent");
	eventQuery.limit(1000);
	return eventQuery.find({useMasterKey: true});
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

Returns: null if there were no changes, or a promise that sends out a
notification to all relevant users if there were changes.

Checks the eventData against the existing event and, if the status field or the
event TIME (hours/minutes) have changed, sends out an alert to all users
subscribed to notifications for this team.  Note that the event DATE cannot
change since we are assuming the date is a uniquely identifying element of an
event.  UPDATES the status/startDateTime fields in |event| if there is a change.
-------------------------------
*/
function diffAthleticsEvent(event, eventData, isGame) {
	const hashCode = hashAthleticsEventWithData(eventData, isGame);

	var promise = null;

	// If the event status changed...
	if (event.get("status") != eventData.status) {
		promise = sendAlertForTeam(eventData.team, "status", eventData.status,
			isGame, event.get("startDateTime"), hashCode);
		event.set("status", eventData.status);
	}

	// If the event TIME changed... (date can't change)
	const newDate = new Date(eventData.startDateTime);
	const dateDiffMilliseconds = newDate - event.get("startDateTime")
	if (dateDiffMilliseconds != 0) {

		// Report how much it changed ("2hr. 20min. earlier")
		var changeType = dateDiffMilliseconds > 0 ? "later" : "earlier";
		const secsChanged = Math.floor(Math.abs(dateDiffMilliseconds) / 1000);
		var minutesChanged = Math.floor(secsChanged / 60);
		const hoursChanged = Math.floor(minutesChanged / 60);
		minutesChanged %= 60;

		var newTimeString = hoursChanged > 0 ? hoursChanged + " hr. " : "";
		newTimeString += minutesChanged + " min. " + changeType;

		promise = sendAlertForTeam(eventData.team, "time", newTimeString,
			isGame, event.get("startDateTime"), hashCode);
		event.set("startDateTime", new Date(eventData.startDateTime));
	}

	return promise;
}


/* FUNCTION:newAthleticsEventFromEventData
-------------------------------------------
Parameters:
	eventData - the data to make a new AthleticsEvent object out of
	hashCode - the hashCode for this event data

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
function newAthleticsEventFromEventData(eventData, hashCode) {
	const event = new AthleticsEvent();
	event.set("hashCode", hashCode);
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
	hashCode - the hashCode for this event that changed

Returns: A promise that sends a notification to all users subscribed to this
team that the given field in this event changed to the given new value.
Increments the icon badge, and includes the hash code of the event that changed.
------------------------------
*/
function sendAlertForTeam(team, fieldChanged, newValue, isGame, date,
	hashCode) {

	const dateString = (date.getMonth() + 1) + "/" + date.getDate();
	const eventType = isGame ? "game" : "practice";
	const message = team + " " + eventType + " on " + dateString + ": "
		+ fieldChanged + " changed to " + newValue + "."
	console.log(message);

	return Parse.Push.send({
	  channels: [team],
	  data: {
	    alert: message,
	    badge: "Increment",
	    hashCode: hashCode
	  }
	});
}


/* FUNCTION: addEventToTeam
----------------------------
Parameters:
	teamName - the name of the team to add the given event to
	event - the event to add
	isGame - whether the given event is a game or practice

Returns: a promise that adds the given event to either the given team's games
or practices array, depending on whether the event is a game or practice.

Requires Master Key usage to access locked down AthleticsEvent objects.
----------------------------
*/
function addEventToTeam(teamName, event, isGame) {
	const teamQuery = new Parse.Query("AthleticsTeam");
	teamQuery.equalTo("teamName", teamName);
	return teamQuery.first({useMasterKey: true}).then(function(team) {
		if (team && isGame) {
			team.set("games", team.get("games").concat([event]));
			return team.save(null, {useMasterKey: true});
		} else if (team) {
			team.set("practices", team.get("practices").concat([event]));
			return team.save(null, {useMasterKey: true});
		} else {
			console.log("Could not find team \"" + teamName + "\"");
			return Parse.Promise.as();
		}
	});
}


/* FUNCTION: removeAthleticsEventsNotUpdatedAfter
-------------------------------------------------
Parameters:
	remainingEventsMap - a map from hashCode to AthleticsEvents to delete.

Returns: a promise that deletes all events in the remainingEventsMap.

Requires Master Key usage to access/remove locked down AthleticsEvent objects.
-------------------------------------------------
*/
function removeRemainingAthleticsEvents(remainingEventsMap) {
	console.log("Removing events: " + Object.keys(remainingEventsMap).length);
	const eventsToDelete = Object.keys(remainingEventsMap).map(function(key) {
		return remainingEventsMap[key];
	});
	
	return Parse.Object.destroyAll(eventsToDelete, {useMasterKey: true});
}


if (!process.env.SERVER_URL) process.env.SERVER_URL = "http://localhost:1337";
Parse.initialize(process.env.APP_ID, null, process.env.MASTER_KEY);
Parse.serverURL = process.env.SERVER_URL + "/parse";
const calendarServerURL = process.env.CALENDAR_SERVER_URL;
updateCalendars(calendarServerURL);

