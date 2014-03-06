// extend jQuery to support 'real' visibility
jQuery.extend(
  jQuery.expr[ ":" ], 
    { reallyvisible : function (a) { 
        return !(jQuery(a).is(':hidden') || jQuery(a).parents(':hidden').length); 
    }}
);

// function to get current time
function get_time() {
    return new Date().getTime();
}


apikey = "vawdf7d6rn5fqxv8j7fw5t4x";
api_url = "http://api.rottentomatoes.com/api/public/v1.0/movies.json";
LOOKUP_WAIT = 2000;
LOOKUPS     = 5;
SCAN_WAIT   = 1000;
lookup_queue = [];
A_WEEK = 7 * 24 * 3600 * 1000;

// no result found
function result_empty_for(item) {
}

function add_icons(dom_ref, movie_data) {
    var jref = $("<div class='ratingOverlay'></div>");

    // handle the absurd 0 case
    var crating_text = movie_data[1] == "0" ? "&nbsp;" : movie_data[1];
    var arating_text = movie_data[3] == "0" ? "&nbsp;" : movie_data[3];

    // create the critic rating
    var crating = $("<div class='rateBox'>" + crating_text + "</div>");
    if (movie_data[2] == true) {
        crating.addClass('fresh');
    } else {
        crating.addClass('rotten');
    }

    // create the audience rating 
    var arating = $("<div class='rateBox'>" + arating_text + "</div>");
    if (movie_data[4] == true) {
        arating.addClass('upright');
    } else {
        arating.addClass('spilt');
    }

    // sometimes the rating may be -1. We don't show the icon then.
    if (movie_data[1] != -1) {
        jref.append(crating);
    }

    if (movie_data[3] != -1) {
        jref.append(arating);
    }

    // put thing on
    $(dom_ref).after(jref);
}

// some result found
function result_for(item, data) {
    // save to cache here
    var key = item['movie_id']
    var movie_data = [      get_time(), 
                            data.ratings.critics_score, data.ratings.critics_rating == "Rotten" ? false : true, 
                            data.ratings.audience_score, data.ratings.audience_rating == "Spilled" ? false : true ];

    var obj = {};
    obj[key] = movie_data

    chrome.storage.local.set(obj); // save to cache
    chrome.storage.local.get(key, function(result) {
        console.log(result);
    });
    console.log("--> " + item.dom_ref + " " + movie_data);
    add_icons(item.dom_ref, movie_data);
}

// lookup function
function lookup() {
   function single_lookup() {
        var item = lookup_queue.shift();
        jQuery.ajax(api_url, { 'data': {
                                            'q': item.title,
                                            'page_limit': 10, 'page': 1,
                                            'apikey': apikey
                                        },

                               'dataType': 'json',
        }).done(function(data) { 
            if (data.total == 0) {
                result_empty_for(item);           
            } else {
                // TODO: Filter it if it is not the same movie
                result_for(item, data.movies[0]);
            }
        })
          .fail(function(jqXHR, textStatus, errorThrown) {
                    console.log("failure in ajax: " + errorThrown);
                });
    }
    for (var i = 0; i < LOOKUPS; ++i) {
         if (lookup_queue.length == 0) {
            return;
        }
        single_lookup();
    }
}

function lookup_cache(movie_id, dom_ref, k) {
    var obj = {}
    obj[movie_id] = [];
    chrome.storage.local.get(obj, function(object) {
        var movie_data = object[movie_id];
        var result = false;

        if (movie_data.length > 0) {
            var stamp = movie_data[0];

            var now = get_time();
            if (now - stamp <= A_WEEK) {
                add_icons(dom_ref, movie_data);
                result = true;
            }
        }
        
        // call continuation
        k(result);
    });
}

function all_movies() {
    return $("div.agMovie img.boxShotImg");
}

function scan_screen_for_movies() {
    var remaining_movies = all_movies().not(".hasOverlay");
    var visible = remaining_movies.filter(":in-viewport").filter(":reallyvisible");

    console.log("remaining: " + remaining_movies.size());
    console.log("visible:" + visible.size()); 

    visible.each(function(idx) {
        // extract information from the movie
        var dom_ref = this;
        var title = $(dom_ref).attr('alt');
        var movie_id = /dbs(\d+)/.exec($(dom_ref).parent().attr('id'))[1];

        console.log( idx + ": " + title + "  " + movie_id);

        // add the hasOverlay ass -- no duplicate requests
        $(dom_ref).addClass("hasOverlay");

        // lookup from cache
        lookup_cache(movie_id, dom_ref, function(result) {
            // queue for lookup if outdated / non-existent
            if (result == false) {
                lookup_queue.push({'title' : title, 'movie_id' : movie_id, 'dom_ref': dom_ref});
            } else {
                // cache hit, nothing.
            }
        });
    });
}

// we can only make 5 requests a second.
$(document).ready(function() {
    all_movies().addClass("noOverlay");
    setInterval(scan_screen_for_movies, SCAN_WAIT);
    setInterval(lookup, LOOKUP_WAIT);
});
