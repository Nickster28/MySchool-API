require('./authentication.js');

Parse.Cloud.define('hello', function(req, res) {
  res.success('Hi');
});