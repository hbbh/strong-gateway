/* jshint camelcase: false, unused: vars */
var chai = require('chai');
chai.should();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var app = require('../server/server');
var request = require('supertest')('https://localhost:3001');

var TOKEN_ENDPOINT = '/oauth/token';
var CLIENT_ID = '123';
var CLIENT_SECRET = 'secret';

describe('Authorize', function() {

  before(function(done) {
    app.once('started', function() {
      var auth = app.oauth2.authenticate({session: false, scope: 'demo'});
      app.use(['/test'], auth, function(req, res, next) {
        if (req.accessToken) {
          req.accessToken.user(function(err, user) {
            if (err) {
              return next(err);
            }
            res.json(user);
          });
        }
      });
      var auth2 = app.oauth2.authenticate({session: false, scope: 'email'});
      app.use(['/email'], auth2, function(req, res, next) {
        if (req.accessToken) {
          req.accessToken.user(function(err, user) {
            if (err) {
              return next(err);
            }
            res.json(user);
          });
        }
      });
      done();
    });
    app.start();
  });

  after(function(done) {
    app.close(done);
  });

  var token;
  before(function(done) {
    request
      .post(TOKEN_ENDPOINT)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({
        grant_type: 'password',
        username: 'bob',
        password: 'secret',
        scope: 'demo'
      })
      .auth(CLIENT_ID, CLIENT_SECRET)
      .expect(200, /"access_token":/i, function(err, res) {
        if (err) {
          return done(err);
        }
        token = res.body.access_token;
        done();
      });
  });

  it('should detect no access token', function(done) {
    request
      .get('/test')
      .expect(401, done);
  });

  it('should allow valid token as query param', function(done) {
    request
      .get('/test?access_token=' + token)
      .expect(200, /"username":"bob"/, done);
  });

  it('should allow valid token in body', function(done) {
    request
      .post('/test')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({ access_token: token })
      .expect(200, /"username":"bob"/, done);
  });

  it('should detect malformed header', function(done) {
    request
      .get('/test')
      .set('Authorization', 'Invalid')
      .expect(400, done);
  });

  it('should allow valid token in header', function(done) {
    request
      .get('/test')
      .set('Authorization', 'Bearer ' + token)
      .expect(200, /"username":"bob"/, done);
  });

  it('should allow exactly one method (get: query + auth)', function(done) {
    request
      .get('/test?access_token=' + token)
      .set('Authorization', 'Bearer Invalid')
      .expect(400, done);
  });

  it('should allow exactly one method (post: query + body)', function(done) {
    request
      .post('/test?access_token=' + token)
      .send({
        access_token: token
      })
      .expect(400, done);
  });

  it('should allow exactly one method (post: query + empty body)',
    function(done) {
      request
        .post('/test?access_token=' + token)
        .send({
          access_token: token
        })
        .expect(400, done);
    });

  it('should detect expired token', function(done) {
    // Mock up an access token to be expired in 1 ms
    var loopback = require('loopback');
    var model = loopback.getModel('OAuthAccessToken');
    model.create({
      id: 'abc123',
      scopes: ['demo'],
      userId: 1,
      appId: '123',
      issuedAt: new Date(),
      expiredAt: new Date(Date.now() + 1)
    }, function(err, token) {
      if(err) {
        return done(err);
      }
      setTimeout(function() {
        request
          .get('/test?access_token=' + token)
          .expect(401, done);
      }, 5);
    });
  });

  it('should detect insufficient_scope', function(done) {
    request
      .get('/email?access_token=' + token)
      .expect(403, /insufficient_scope/i, done);
  });

});