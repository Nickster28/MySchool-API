/*
 * CLOUD FUNCTION: IsValidEditionName
 * ------------------------------------
 * Parameters:
 *		name - the edition name to validate
 *
 * Returns: whether or not this edition name is valid (non-empty, unique).
 * ------------------------------------
 */
Parse.Cloud.define("IsValidEditionName", function(req, res) {
	
	// If there's no name, send an error, and if the name is empty, send false
	if (!req.params.name) {
		res.error("No name provided");
	else if (req.params.name === "") {
		res.success(false);
	} else {
		var editionsQuery = new Parse.Query("Edition");
		editionsQuery.equalTo("editionName", req.params.name);
		editionsQuery.first().then(function(edition) {
			res.success(edition ? false : true);
		}, function(error) {
			res.error(error);
		});
	}
});