var test = require('tape');
var path = require('path');
var crypto = require('crypto');
var tileliveCopy = require('../lib/copy').tilelive;
var AWS = require('aws-sdk');
var s3urls = require('s3urls');
var os = require('os');
var fs = require('fs');
var mtc = require('..'); // just to get protocols registered

process.env.MapboxAPIMaps = 'https://api.tiles.mapbox.com';

var bucket = process.env.TestBucket || 'tilestream-tilesets-development';
var runid = crypto.randomBytes(16).toString('hex');

console.log('---> mapbox-tile-copy copy.tilelive %s', runid);

function dsturi(name) {
  return [
    's3:/',
    bucket,
    'test/mapbox-tile-copy',
    runid,
    name,
    '{z}/{x}/{y}'
  ].join('/');
}

function tileCount(dst, callback) {
  var s3 = new AWS.S3();
  var count = 0;

  params = s3urls.fromUrl(dst.replace('{z}/{x}/{y}', ''));
  params.Prefix = params.Key;
  delete params.Key;

  function list(marker) {
    if (marker) params.Marker = marker;

    s3.listObjects(params, function(err, data) {
      if (err) return callback(err);
      count += data.Contents.length;
      if (data.IsTruncated) return list(data.Contents.pop().Key);
      callback(null, count);
    });
  }

  list();
}

test('copy mbtiles', function(t) {
  var fixture = path.resolve(__dirname, 'fixtures', 'valid.mbtiles');
  var src = 'mbtiles://' + fixture;
  var dst = dsturi('valid.mbtiles');
  tileliveCopy(src, dst, {}, function(err) {
    t.ifError(err, 'copied');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.equal(count, 21, 'expected number of tiles');
      t.end();
    });
  });
});


var onlineTiles;

test('copy omnivore', function(t) {
  var fixture = path.resolve(__dirname, 'fixtures', 'valid.geojson');
  var src = 'omnivore://' + fixture;
  var dst = dsturi('valid.geojson');
  onlineTiles = dst;
  tileliveCopy(src, dst, { maxzoom: 5 }, function(err) {
    t.ifError(err, 'copied');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.equal(count, 30, 'expected number of tiles');
      t.end();
    });
  });
});

test('copy tilejson', function(t) {
  var fixture = path.resolve(__dirname, 'fixtures', 'valid.tilejson');
  var tmp = path.join(os.tmpdir(), crypto.randomBytes(16).toString('hex'));

  fs.readFile(fixture, 'utf8', function(err, data) {
    data = JSON.parse(data);
    data.tiles = [ s3urls.convert(onlineTiles, 'bucket-in-host') ];
    fs.writeFile(tmp, JSON.stringify(data), runCopy);
  });

  function runCopy() {
    var src = 'tilejson://' + tmp;
    var dst = dsturi('valid.tilejson');
    tileliveCopy(src, dst, {}, function(err) {
      t.ifError(err, 'copied');
      tileCount(dst, function(err, count) {
        t.ifError(err, 'counted tiles');
        t.equal(count, 30, 'expected number of tiles');
        t.end();
      });
    });
  }
});

test('copy tm2z', function(t) {
  var fixture = path.resolve(__dirname, 'fixtures', 'valid.tm2z');
  var src = 'tm2z://' + fixture;
  var dst = dsturi('valid.tm2z');
  tileliveCopy(src, dst, { maxzoom: 3 }, function(err) {
    t.ifError(err, 'copied');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.equal(count, 85, 'expected number of tiles');
      t.end();
    });
  });
});

test('copy in parallel', function(t) {
  var fixture = path.resolve(__dirname, 'fixtures', 'valid.mbtiles');
  var src = 'mbtiles://' + fixture;
  var dst = dsturi('parallel');
  tileliveCopy(src, dst, { job: { total: 10, num: 2 } }, function(err) {
    t.ifError(err, 'copied');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.ok(count < 21, 'did not render all tiles');
      t.end();
    });
  });
});

test('copy invalid source', function(t) {
  var fixture = path.resolve(__dirname, 'fixtures', 'invalid.tilejson');
  var src = 'tilejson://' + fixture;
  var dst = dsturi('invalid.tilejson');
  tileliveCopy(src, dst, {}, function(err) {
    t.ok(err, 'expected error');
    t.equal(err.code, 'EINVALID', 'marked invalid when cannot load source');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.equal(count, 0, 'rendered no tiles');
      t.end();
    });
  });
});

test('copy corrupt mbtiles', function(t) {
  var fixture = path.resolve(__dirname, 'fixtures', 'invalid.corrupt.mbtiles');
  var src = 'mbtiles://' + fixture;
  var dst = dsturi('invalid.mbtiles');
  tileliveCopy(src, dst, {}, function(err) {
    t.ok(err, 'expected error');
    t.equal(err.code, 'SQLITE_CORRUPT', 'pass-through errors encountered during copy');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.equal(count, 0, 'did not render any tiles');
      t.end();
    });
  });
});

test('copy null-tile mbtiles', function(t) {
  var fixture = path.resolve(__dirname, 'fixtures', 'invalid.null-tile.mbtiles');
  var src = 'mbtiles://' + fixture;
  var dst = dsturi('invalid.mbtiles');
  tileliveCopy(src, dst, {}, function(err) {
    t.ok(err, 'expected error');
    t.equal(err.code, 'EINVALIDTILE', 'pass-through errors encountered during copy');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.equal(count, 0, 'did not render any tiles');
      t.end();
    });
  });
});