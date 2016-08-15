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

/*
 * CLOUD FUNCTION: BeforeSave NewspaperEdition
 * -----------------------------------
 * Verifies that edition names are unique before saving a new object.
 * -----------------------------------
 */
Parse.Cloud.beforeSave("NewspaperEdition", function(req, res) {
	if (req.object.isNew()) {
		var name = req.object.get("editionName");
		return isValidNewspaperEditionName(name).then(function(isValid) {
			if (isValid) {
				res.success();
			} else {
				res.error("Newspaper Edition name is not unique");
			}
		}, function(error) {
			res.error(error);
		});
	} else {
		res.success();
	}
});