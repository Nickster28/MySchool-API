require("./authentication.js");
require("./newspaper.js");

Parse.Cloud.define("test", function(req, res) {
  res.success("Hi");
});