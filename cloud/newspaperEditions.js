/*
 * FUNCTION: isValidNewspaperEditionName
 * -----------------------------
 * Parameters:
 *		name - the edition name to validate
 *		sessionToken (optional) - the sessionToken of the user to use when
 *								making Parse server calls.
 *
 * Returns: a promise passing back whether the given edition name is valid
 * 			(unique, non-empty).  Also takes an optional sessionToken to use to
 * 			validate the query.
 * -----------------------------
 */
function isValidNewspaperEditionName(name, sessionToken) {
	if (name === undefined || name === null) {
		return Parse.Promise.error("No name provided");
	} else if (name === "") {
		return Parse.Promise.as(false);
	} else {
		var queryOptions = sessionToken ? {sessionToken: sessionToken} : {};
		var NewspaperEdition = Parse.Object.extend("NewspaperEdition");
		var editionsQuery = new Parse.Query(NewspaperEdition);
		editionsQuery.equalTo("editionName", name);
		return editionsQuery.first(queryOptions).then(function(edition) {
			return (edition ? false : true);
		});
	}
}

/*
 * CLOUD FUNCTION: IsValidNewspaperEditionName
 * ------------------------------------
 * Request Parameters:
 *		name - the edition name to validate
 *
 * Returns: whether or not this edition name is valid (non-empty, unique).
 *
 * Must be called by a logged-in Parse User.
 * ------------------------------------
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

/*
 * FUNCTION: setDefaultSectionsForEdition
 * ------------------------------------------
 * Parameters:
 *		edition - the edition to set default sections for
 *		sessionToken - the session token of the user making this request
 *
 * Returns: a promise that creates newspaper sections for the given edition
 * 			(based on the names in DEFAULT_NEWSPAPER_SECTIONS in the server
 *			config), saves them, and sets the edition's |sections| field equal
 *			to them.
 * ------------------------------------------
 */
function setDefaultSectionsForEdition(edition, sessionToken) {
	var NewspaperSection = Parse.Object.extend("NewspaperSection");
	return Parse.Config.get().then(function(config) {
		var promises = [];
		var sections = config.get("DEFAULT_NEWSPAPER_SECTIONS")
			.map(function(sectionName) {
				var section = new NewspaperSection();
				section.set("sectionName", sectionName);
				promises.push(section.save(null, {sessionToken: sessionToken}));
				return section;
		});

		return Parse.Promise.when(promises).then(function() {
			return sections;
		});
	}).then(function(sections) {
		edition.set("sections", sections);
	});
}

/*
 * CLOUD FUNCTION: BeforeSave NewspaperEdition
 * -----------------------------------
 * For existing objects:
 * 	- checks if it was just changed to "published", and if it was, notifies all
 * 		users.
 *
 * For new objects:
 *	- verifies the edition name
 *	- fills in the defualt isPublished status = false
 *	- fills in the default sections array to new NewspaperSections
 * -----------------------------------
 */
Parse.Cloud.beforeSave("NewspaperEdition", function(req, res) {
	if (!req.user) {
		res.error("NewspaperEdition must be made by logged-in user");

	// If it isn't new, check the database copy to see if it's being published
	} else if (!req.object.isNew() &&
		req.object.dirtyKeys().includes("isPublished")) {

		var query = new Parse.Query("NewspaperEdition");
		return query.get(req.object.id,
			{sessionToken: req.user.getSessionToken()}).then(function(edition) {

			if (edition.get("isPublished") != req.object.get("isPublished") &&
				req.object.get("isPublished")) {
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

// Clean up all the sections associated with the edition being deleted
Parse.Cloud.afterDelete("NewspaperEdition", function(req, res) {
	if (!req.user) {
		console.error("NewspaperSection cleanup must be made by valid user.");
	} else {
		return Parse.Object.destroyAll(req.object.get("sections"),
			{sessionToken: req.user.getSessionToken()});
	}
});