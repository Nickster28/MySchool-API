Parse.Cloud.define("IsValidEditionName", function(req, res) {
	var editionsQuery = new Parse.Query("Edition");
	editionsQuery.equalTo("editionName", req.params.name);
	editionsQuery.first().then(function(edition) {
		res.success(edition ? false : true);
	}, function(error) {
		res.error(error);
	});
});