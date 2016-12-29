require("./authentication.js");
require("./newspaperEditions.js");

Parse.Cloud.define("test", function(req, res) {
  res.success("Hi");
});