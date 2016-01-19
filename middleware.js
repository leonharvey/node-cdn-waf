var connect     = require('connect');
var compression = require('compression');
var md5         = require('md5');
var fs          = require('fs');
var path        = require('path');
var request     = require('request');
var MMDBReader  = require('mmdb-reader');
var app         = connect();
var gateway     = require(__dirname + '/app');
var sites       = require(__dirname + '/sites');

var reader          = new MMDBReader(__dirname + '/countries.mmdb');
var hash_store      = [];
var memory_cache    = [];

var static_resource = ['.css', '.bmp', '.tif', '.ttf', '.docx', '.woff2', '.js', '.pict', '.tiff', '.eot', '.xlsx', '.jpg', '.csv', '.eps', '.woff', '.xls', '.jpeg', '.doc', '.ejs', '.otf', '.pptx', '.gif', '.pdf', '.swf', '.svg', '.ps', '.ico', '.pls', '.midi', '.svgz', '.class', '.png', '.ppt', '.mid', '.webp', '.jar'];

app.use(compression());

//Req exts
app.use(function(req, res, next) {
    req.host    = req.headers.host.split(':')[0];
    req.url     = req.originalUrl;

    req.url_split   = req.url.split('?')[0];
    req.ext         = path.extname(req.url_split);
    req.ip          = req.connection.remoteAddress.replace('::ffff:', '');
    req.host_key    = req.host.substring(0, 4) !== 'www.' ? 'www.' + req.host : req.host
    
    if (typeof sites.sites[req.host_key] == 'undefined')
        return res.end('No route found');
        
    req.site        = sites.sites[req.host_key];
    
    
    if (typeof req.headers.referer !== 'undefined' && req.headers.referer !== req.host) {
        req.valid_referer = false;
    }
    else {
        req.valid_referer = true;
    }

    if (static_resource.indexOf(req.ext) > -1) {
        req.static_resource = true;
    }
    else {
        req.static_resource = false;
    }

    next();
    //ASYNC below
})

//store request & file hash
app.use(function(req, res, next) {
    if (typeof hash_store[req.host] == 'undefined')
        hash_store[req.host] = {
            key: md5(req.host),
            sub: []
        };

    if (typeof hash_store[req.host].sub[req.url_split] == 'undefined')
        hash_store[req.host].sub[req.url_split] = md5(req.url_split);

    req.cache_dir   = hash_store[req.host];
    req.cache_file  = hash_store[req.host].key + '/' + hash_store[req.host].sub[req.url_split];
    
    next();
});

app.use(function(req, res, next) {
    if (typeof req.site.config.countries_restricted !== 'undefined' && req.site.config.countries_restricted.length > 0) {
        var geoip = reader.lookup(req.ip);

        if (typeof req.site.config.countries_restricted !== 'undefined' &&
            typeof geoip !== 'undefined' &&
            typeof geoip.country !== 'undefined' &&
            typeof geoip.country.names !== 'undefined' &&
            typeof geoip.country.names.en !== 'undefined' &&
            req.site.config.countries_restricted.indexOf(geoip.country.names.en.toLowerCase()) > -1) {

            return res.end('Accessing from restricted country');
        }
    }

    next();
})

//SSL config
app.use(function(req, res, next) {
    if (req.method == 'http' && req.site.config.ssl) {
        res.writeHead(302, {
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', // 1 year
            "Location": 'https://' + req.headers.host + req.url
        });
        res.end();
    }
    else {
        next();
    }
});

//Hotlinking protection
app.use(function(req, res, next) {
    if (static_resource) {
        if (!req.valid_referer) {
            //ignore google, yahoo, bing, facebook, twitter, instagram, tumblr in referers
            return res.end('Hotlinking protection active');
        }
    }

    next();
});

//CSRF protection
app.use(function(req, res, next) {
    if (typeof req.headers.origin !== 'undefined' && req.headers.origin !== host) {
        res.end('CSRF protection active');
    }
    else if (req.method == 'POST' && !req.valid_referer) {
        res.end('CSRF protection active');
    }
    else {
        next();
    }
});


//Cache file fetch
app.use(function(req, res, next) {
    if (req.static_resource) {
        var cache_data = fetchCache(req.site, req.cache_file);

        if (cache_data)
            return send(cache_data);

        request('http://' + req.host + req.url, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                res.end(body);

                storeCache(req.host_key, body, compressionHandler);
            }
            else {
                return res.end('An error occurred accessing the requested document');
            }
        });
    }
    else {
        next();
    }
});



function compressionHandler(ext, filename) {
    if (contentExists(ext)) {
        switch (ext) {
            case 'js':
                docAsset();
                break;
            case 'css':
                docAsset();
                break;
            case 'png':
                break;
        }

        function docAsset() {
            new compressor.minify({
                type: 'yui-' + (ext == '.js' ? 'js' : 'css'),
                fileIn: filename,
                fileOut: filename,
                callback: function(err, min) {}
            });
        }
    }
}

function fetchCache(site, key) {
    if (site.config.cache_in_memory) {
        if (typeof memory_cache[key] !== 'undefined') return memory_cache[key];
    }

    try {
        var cache_fetch = fs.readFileSync(key).toString();
    }
    catch (e) {
        console.log(e);
    }

    if (contentExists(cache_fetch)) {
        if (site.config.cache_in_memory)
            memory_cache[key] = cache_fetch;

        return cache_fetch;
    }
}

function storeCache(key, value, callback) {
    fs.lstat(key.split('/')[0], function(err, stats) {
        if (err) fs.mkdir(key);

        fs.writeFile(key, value, (err) => {
            if (err) console.log(err);
            memory_cache[key] = value;

            callback();
        });
    })
}

function contentExists(content) {
    if (typeof content !== 'undefined' && typeof content.length !== 'undefined' && content.length > 0) {
        return true;
    }
}

function configTrue(option) {
    if (typeof opt.config !== 'undefined' && opt.config[option] !== 'undefined' && opt.config[option] == true) return true;
}
module.exports = app;