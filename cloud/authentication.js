/* 
 * CLOUD FUNCTION: RoleNameForUser
 * --------------------------------
 * Returns true/false whether or not the user making this request is a
 * newspaper admin.  There must be a non-null Parse User making this request.
 * --------------------------------
 */
Parse.Cloud.define("IsNewspaperAdmin", function(req, res) {
	getRoleNameForUser(req.user).then(function(roleName) {
		res.success(roleName == "NewspaperAdmin");
	}, function(error) {
		res.error(error);
	});
});

/*
 * FUNCTION: roleNameForServer
 * ----------------------------
 * Parameters:
 * 		user - the Parse user to return the role name for
 *
 * Returns: a Parse promise passing back the string name of the role the user
 * is assigned to, or null if there isn't one.  Note that if the user has
 * multiple roles (which they shouldn't, since this app's roles are mutually
 * exclusive) only the name of the first role from the role query will be
 * returned.
 *
 * Returns an error Promise if |user| = null or if an error occurred.
 * ----------------------------
 */
function getRoleNameForUser(user) {
	if (!user) {
		return Parse.Promise.error("Can't get role for this user - no user provided.");
	}

	var token = user.getSessionToken();
	var roleQuery = new Parse.Query(Parse.Role);
	roleQuery.equalTo("users", user);
	return roleQuery.first({ sessionToken: token }).then(function(role) {
		if (role) return role.get("name");
		else return null;
	});
}