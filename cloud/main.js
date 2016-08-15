require('./authentication.js');
require('./newspaperEditions.js');

Parse.Cloud.define('hello', function(req, res) {
  res.success('Hi');
});