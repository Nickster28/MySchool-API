/* CLOUD FUNCTION: AfterDelete AthleticsTeam
---------------------------------------------
Deletes all of this team's practice and game AthleticsEvent objects.
---------------------------------------------
*/
Parse.Cloud.afterDelete("AthleticsTeam", function(req, res) {
	return Parse.Object.destroyAll(req.object.get("games"), {
		useMasterKey: true
	}).then(function() {
		return Parse.Object.destroyAll(req.object.get("practices"), {
			useMasterKey: true
		});
	});
});