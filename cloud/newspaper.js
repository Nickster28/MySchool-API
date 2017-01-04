/* FUNCTION: isValidNewspaperEditionName
----------------------------------------
Parameters:
	name - the edition name to validate
	sessionToken - the sessionToken of the user to use when making Parse
					server calls.

Returns: a promise passing back whether the given edition name is valid
		(unique, non-empty).  Also takes an optional sessionToken to use to
		validate the query.
----------------------------------------
*/
function isValidNewspaperEditionName(name, sessionToken) {
	// Check explicitly since "" is caught by if (!name).
	if (name === undefined || name === null) {
		return Parse.Promise.error("No name provided");
	} else if (!sessionToken) {
		return Parse.Promise.error("No session token provided");
	} else if (name === "") {
		return Parse.Promise.as(false);
	} else {
		var queryOptions = {sessionToken: sessionToken};
		var NewspaperEdition = Parse.Object.extend("NewspaperEdition");
		var editionsQuery = new Parse.Query(NewspaperEdition);
		editionsQuery.equalTo("editionName", name);
		return editionsQuery.first(queryOptions).then(function(edition) {
			return (edition ? false : true);
		});
	}
}


/* CLOUD FUNCTION: IsValidNewspaperEditionName
----------------------------------------------
Request Parameters:
	name - the edition name to validate

Returns: whether or not this edition name is valid (non-empty, unique).

Must be called by a logged-in Parse User.
----------------------------------------------
*/
Parse.Cloud.define("IsValidNewspaperEditionName", function(req, res) {
	if (!req.user) {
		res.error("Request must be made by logged-in user");
	} else {
		var name = req.params.name;
		return isValidNewspaperEditionName(name, req.user.getSessionToken())
		.then(function(isValid) {
			res.success(isValid);
		}, function(error) {
			res.error(error);
		});
	}
});


// TODO
function publishEdition(edition) {
	console.log("Publishing edition...");
	return Parse.Promise.as();
}


/* FUNCTION: setDefaultSectionsForEdition
------------------------------------------
Parameters:
	edition - the edition to set default sections for
	sessionToken - the session token of the user making this request

Returns: a promise that creates newspaper sections for the given edition
		(based on the names in DEFAULT_NEWSPAPER_SECTIONS in the server
		config), saves them, and sets the edition's |sections| field equal
		to them.
------------------------------------------
*/
function setDefaultSectionsForEdition(edition, sessionToken) {
	var NewspaperSection = Parse.Object.extend("NewspaperSection");
	return Parse.Config.get().then(function(config) {
		var promises = config.get("DEFAULT_NEWSPAPER_SECTIONS")
			.map(function(sectionName) {
				var section = new NewspaperSection();
				section.set("sectionName", sectionName);
				section.set("articles", []);
				return section.save(null, {sessionToken: sessionToken});
		});

		return Parse.Promise.when(promises);
	}).then(function(sections) {
		edition.set("sections", sections);
	});
}


/* CLOUD FUNCTION: BeforeSave NewspaperEdition
-----------------------------------------------
For existing objects:
	- checks if just changed to "published", and if so, notifies all users.

For new objects:
	- verifies the edition name
	- fills in the defualt isPublished status = false
	- fills in the default sections array to new NewspaperSections
-----------------------------------------------
*/
Parse.Cloud.beforeSave("NewspaperEdition", function(req, res) {
	if (!req.user) {
		res.error("NewspaperEdition must be made by logged-in user.");

	// If it isn't new, check the database copy to see if it's being published
	// (Note: dirtyKeys means keys that were saved, NOT necessarily changed!)
	} else if (!req.object.isNew() && req.object.get("isPublished") &&
		req.object.dirtyKeys().includes("isPublished")) {

		var query = new Parse.Query("NewspaperEdition");
		return query.get(req.object.id,
			{sessionToken: req.user.getSessionToken()}).then(function(edition) {

			if (!edition.get("isPublished")) {
				return publishEdition(edition);
			}
		}).then(function() {
			res.success();
		}, function(error) {
			res.error(error);
		});
	} else if (req.object.isNew()) {
		// 1) Validate the edition name and
		// 2) add the default sections to the edition
		var name = req.object.get("editionName");
		return isValidNewspaperEditionName(name, req.user.getSessionToken())
			.then(function(isValid) {

			if (!isValid) {
				res.error("Newspaper Edition name is not unique");
			} else {
				// Fill in defaults
				req.object.set("isPublished", false);
				return setDefaultSectionsForEdition(req.object,
					req.user.getSessionToken()).then(function() {

					res.success();
				});
			}
		}, function(error) {
			res.error(error);
		});
	} else {
		res.success();
	}
});


/* CLOUD FUNCTION: RoleNameForUser
-------------------------------
Returns true/false whether or not the user making this request is a
newspaper admin.  There must be a non-null Parse User making this request.
-------------------------------
*/
Parse.Cloud.define("IsNewspaperAdmin", function(req, res) {
	getRoleNameForUser(req.user).then(function(roleName) {
		res.success(roleName == "NewspaperAdmin");
	}, function(error) {
		res.error(error);
	});
});


/* FUNCTION: roleNameForUser
-------------------------------
Parameters:
	user - the Parse user to return the role name for

Returns: a Parse promise passing back the string name of the role the user
is assigned to, or null if there isn't one.  Note that if the user has
multiple roles (which they shouldn't, since these roles are mutually exclusive)
only the name of the first role from the role query will be
returned.

Returns an error Promise if |user| = null or if an error occurred.
-------------------------------
*/
function getRoleNameForUser(user) {
	if (!user) {
		return Parse.Promise.error("Can't get role - no user provided.");
	}

	var token = user.getSessionToken();
	var roleQuery = new Parse.Query(Parse.Role);
	roleQuery.equalTo("users", user);
	return roleQuery.first({ sessionToken: token }).then(function(role) {
		if (role) return role.get("name");
		else return null;
	});
}


/* CLOUD FUNCTION: AfterDelete NewspaperEdition
------------------------------------------------
Deletes all of this edition's NewspaperSection objects.
------------------------------------------------
*/
Parse.Cloud.afterDelete("NewspaperEdition", function(req, res) {
	return Parse.Object.destroyAll(req.object.get("sections"), {
		useMasterKey: true
	});
});


/* CLOUD FUNCTION: AfterDelete NewspaperSection
------------------------------------------------
Deletes all of this section's NewspaperArticle objects.
------------------------------------------------
*/
Parse.Cloud.afterDelete("NewspaperSection", function(req, res) {
	return Parse.Object.destroyAll(req.object.get("articles"), {
		useMasterKey: true
	});
});


