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
	email - the user's email
	firstName - the user's first name
	lastName - the user's last name

Returns: a promise that creates a new Parse User object, filling in the
firstName, lastName, classes, and grade fields.  email, and name are filled in
from the parameters; the remaining fields are filled in from the provided person
object, or initialized to empty otherwise (empty class list, -1 grade).
----------------------------------
*/
function sessionTokenForPerson(person, email, firstName, lastName) {
	const user = new Parse.User();
	user.setUsername(email);
	user.set("firstName", firstName);
	user.set("lastName", lastName);

	if (person) {
		user.set("classes", person.get("classSchedule"));
		user.set("grade", person.get("grade"));
	} else {
		user.set("classes", []);
		user.set("grade", 0);
	}

	const password = randomPassword();
	user.setPassword(password);
	return user.signUp(null, {useMasterKey: true}).then(function(signedUpUser) {
		return Parse.User.logIn(signedUpUser.get("username"), password);
	}).then(function(loggedInUser) {
		const token = loggedInUser.getSessionToken();
		const roleQuery = new Parse.Query(Parse.Role);
		const roleName = user.get("grade") == -1 ? "Teacher" : "Student";
		roleQuery.equalTo("name", roleName);
		return roleQuery.first({ sessionToken: token }).then(function(role) {
			role.getUsers().add(loggedInUser);
		}).then(function() {
			return loggedInUser.getSessionToken();
		});
	});
}


/* FUNCTION: sessionTokenForEmail
----------------------------------
Parameters:
	email - the email of the user to return a session token for
	firstName - the first name of the user, used when a new User is created
	lastName - the last name of the user, used when a new User is created

Returns: a Promise that passes back the session token for the Parse user with
	this email address.  It does this by first checking if an existing Parse
	User has this email; if so, this user has logged in before and we return
	their session token.  Otherwise, we make a new User, using the Person object
	(if any) for this email.

Requires master key use to query user and person objects.
----------------------------------
*/
function sessionTokenForEmail(email, firstName, lastName) {

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
				return sessionTokenForPerson(person, email, firstName,
					lastName);
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
			console.log("Verification stack trace: " + err.stack);
			const errorCode = Parse.Error.OTHER_CAUSE;
			const error = new Parse.Error(errorCode, "Error validating token.");
			promise.reject(error);
		} else if (schoolDomain
			&& loginInfo.getPayload()["hd"] != schoolDomain) {

			const errorCode = Parse.Error.INVALID_EMAIL_ADDRESS;
			const error = new Parse.Error(errorCode, "Please log in using an " +
				"@" + schoolDomain + " emailAddress.");
			promise.reject(error);
		} else {
			promise.resolve(loginInfo.getPayload());
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
	const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
	const SCHOOL_DOMAIN = process.env.SCHOOL_DOMAIN;
	verifyIdToken(request.params.idToken, CLIENT_ID, SCHOOL_DOMAIN)
	.then(function(payload) {
		return sessionTokenForEmail(payload["email"], payload["given_name"],
			payload["family_name"]);
	}).then(function(sessionToken) {
		response.success(sessionToken);
	}, function(error) {
		response.error(error);
	});
});
