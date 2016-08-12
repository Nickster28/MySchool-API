require('./authentication.js');
require('./editions.js');

Parse.Cloud.define('hello', function(req, res) {
  res.success('Hi');
});