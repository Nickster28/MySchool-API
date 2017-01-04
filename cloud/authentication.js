/* FILE: authentication.js
--------------------------
Handles the Google -> Parse User authentication flow, including translating
Google Id Tokens to Parse User session tokens and creating Parse User objects
from Person objects.
--------------------------
*/

const Buffer = require("buffer").Buffer;
const GoogleAuth = require("google-auth-library");
const auth = new GoogleAuth();


/* FUNCTION: getURL
--------------------------
Parameters:
    url - the url to GET
    paramsObject - a dictionary of key/value pairs to include as request params

Returns: a promise containing the GET response from the given url + params

Uses "request" within a promise.  If there's an error, the error will be passed
back in a promise.  Otherwise, the response is passed back.
--------------------------
*/
function getURL(url, paramsObject) {
    "use strict";
    return new Promise(function(resolve, reject) {
        request({url: url, qs: paramsObject}, function(error, response, body) {
            if(error) {
            	console.log(error.stack);
            	const error = new Parse.Error(Parse.Error.OTHER_CAUSE,
            		JSON.stringify(error));
            	reject(error);
            } else resolve(body);
        });
    });
}


/* FUNCTION: randomPassword
---------------------------
Parameters: NA
Returns: a randomly-generated length-24 numeric password.
---------------------------
*/
function randomPassword() {
	var password = new Buffer(24);
	for (var i = 0; i < 24; i++) {
		password[i] = Math.floor(Math.random() * 256);
	}
	return password.toString('base64');
}


/* FUNCTION: sessionTokenForUser
--------------------------------
Parameters:
	user - the Parse User object to get a session token for

Returns: a promise that regenerates the given user's password in order to log
them in and return back a session token (or an error if an error occurred).

Requires master key use to save new user password.
--------------------------------
*/
function sessionTokenForUser(user) {

	// Make a new random password for this user to re-log them in
	const password = randomPassword();
	user.setPassword(password);

	// Now log the user in and return a session token
	return user.save(null, {useMasterKey: true}).then(function(savedUser) {
		return Parse.User.logIn(savedUser.get("username"), password);
	}).then(function(loggedInUser) {
		return loggedInUser.getSessionToken();
	});
}


/* FUNCTION: sessionTokenForPerson
----------------------------------
Parameters:
	person - the Parse Person object to get a session token for

Returns: a promise that creates a new Parse User object for the given Person
and returns a session token for that user (or an error if an error occurs).
----------------------------------
*/
function sessionTokenForPerson(person) {
	const user = new Parse.User();
	user.setUsername(person.get("emailAddress"));
	user.set("firstName", person.get("firstName"));
	user.set("lastName", person.get("lastName"));
	user.set("classes", person.get("classSchedule"));
	user.set("grade", person.get("grade"));

	const password = randomPassword();
	user.setPassword(password);
	return user.signUp(null, {useMasterKey: true}).then(function(signedUpUser) {
		return Parse.User.logIn(signedUpUser.get("username"), password);
	}).then(function(loggedInUser) {
		return loggedInUser.getSessionToken();
	});
}


/* FUNCTION: sessionTokenForEmail
----------------------------------
Parameters:
	email - the email of the user to return a session token for

Returns: a Promise that passes back the session token for the Parse user with
	this email address, or an error if the user's email is invalid.  It does
	this by first checking if an existing Parse User has this email; if so, this
	user has logged in before and we return their session token.  If an existing
	Person has this email, this means they are a valid user but have not yet
	signed in; in this case, we make a new Parse User for them.  In all other
	cases, the email is invalid, so we return an error Promise.

Requires master key use to query user and person objects.
----------------------------------
*/
function sessionTokenForEmail(email) {

	// First see if there's already a User for this email
	const userQuery = new Parse.Query(Parse.User);
	userQuery.equalTo("username", email);
	return userQuery.first({useMasterKey: true}).then(function(user) {
		if(user) {
			return sessionTokenForUser(user);
		} else {
			const personQuery = new Parse.Query("Person");
			personQuery.equalTo("emailAddress", email);
			return personQuery.first({
				useMasterKey: true
			}).then(function(person) {
				if (person) {
					return sessionTokenForPerson(person);
				} else {
					const errorCode = Parse.Error.INVALID_EMAIL_ADDRESS;
					const error = new Parse.Error(errorCode, "We can't seem" +
						" to find " + email + " in the school directory. " +
						" Please make sure you're logging in with your school" +
						" email address.  If you think this is a mistake," +
						" shoot us an email from the Settings page.");
					return Parse.Promise.error(error);
				}
			});
		}
	});
}


/* FUNCTION: verifyIdToken
--------------------------
Parameters:
	idToken - the Google Sign-in ID token to verify
	clientId - the client id of the applicatoin the idToken is for
	schoolDomain - the domain (e.g. "myschool.org") the email should be in.
				If null, accepts sign-ins from any domain.

Returns: a promise that verifies the given Google Sign-in ID token and either
returns a Promise error if it's invalid (or not a school account) or a success
Promise containing the account's email.
--------------------------
*/
function verifyIdToken(idToken, clientId, schoolDomain) {
	const promise = new Parse.Promise();
	const client = new auth.OAuth2(clientId, '', '');
	client.verifyIdToken(idToken, clientId, function(err, loginInfo) {
		// If there's an error or we need to limit to a schoolDomain...
		if (err) {
			console.log(err.stack);
			const errorCode = Parse.Error.OTHER_CAUSE;
			const error = Parse.Error(errorCode, JSON.stringify(err));
			promise.reject(error);
		} else if (schoolDomain
			&& loginInfo.getPayload()["hd"] != schoolDomain) {

			const errorCode = Parse.Error.INVALID_EMAIL_ADDRESS;
			const error = Parse.Error(errorCode, "Please log in using an " +
				"@" + schoolDomain + " emailAddress.");
			promise.reject(error);
		} else {
			promise.resolve(loginInfo.getPayload()["email"]);
		}
	});

	return promise;
}


/* Cloud Function: sessionTokenForIDToken
----------------------------------------------------
Function that takes a Google ID Token returns a session
token for that user.  It does this by querying for an existing User
with the email in the ID Token, or creating a new User if one doesn't exist.
If ID Token is invalid, or the email can't be found, an error is returned.
----------------------------------------------------
*/
Parse.Cloud.define("sessionTokenForIDToken", function(request, response) {
	Parse.Config.get().then(function(config) {
		const CLIENT_ID = config.get("GOOGLE_CLIENT_ID");
		const SCHOOL_DOMAIN = config.get("SCHOOL_DOMAIN");
		return verifyIdToken(request.params.idToken, CLIENT_ID, SCHOOL_DOMAIN);
	}).then(function(email) {
		return sessionTokenForEmail(email);
	}).then(function(sessionToken) {
		response.success(sessionToken);
	}, function(error) {
		response.error(error);
	});
});
