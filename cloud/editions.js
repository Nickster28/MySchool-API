/*
 * CLOUD FUNCTION: IsValidEditionName
 * ------------------------------------
 * Request Parameters:
 *		name - the edition name to validate
 *
 * Returns: whether or not this edition name is valid (non-empty, unique).
 *
 * Must be called by a logged-in Parse User.
 * ------------------------------------
 */
Parse.Cloud.define("IsValidEditionName", function(req, res) {
	if (!req.user) {
		res.error("Request must be made by logged-in user");
	} else if (req.params.name === undefined || req.params.name === null) {
		res.error("No name provided");
	} else if (req.params.name === "") {
		res.success(false);
	} else {
		var token = req.user.getSessionToken();
		var editionsQuery = new Parse.Query("Edition");
		editionsQuery.equalTo("editionName", req.params.name);
		editionsQuery.first({ sessionToken: token }).then(function(edition) {
			res.success(edition ? false : true);
		}, function(error) {
			res.error(error);
		});
	}
});

/*
 * CLOUD FUNCTION: BEFORESAVE EDITION
 * -----------------------------------
 * Verifies that edition names are unique before saving.
 * -----------------------------------
 */
Parse.Cloud.beforeSave("Edition", function(req, res) {
	Parse.Cloud.run("IsValidEditionName",
		{name: req.object.get("editionName")}).then(function(isValidName) {
		if (isValidName) {
			res.success();
		} else {
			res.error("Edition name is not unique");
		}
	}, function(error) {
		res.error(error);
	});
});