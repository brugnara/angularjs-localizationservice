'use strict';

/*
 * An AngularJS Localization Service
 *
 * Written by Jim Lavin
 * http://codingsmackdown.tv
 *
 */

angular.module('localization', [])
    // localization service responsible for retrieving resource files from the server and
    // managing the translation dictionary
    .factory('localize', ['$http', '$rootScope', '$window', '$filter', function ($http, $rootScope, $window, $filter) {
        var localize = {
            // use the $window service to get the language of the user's browser
            language: '',
            // array to hold the localized resource string entries
            dictionary: [],
            // array for scoped dictionaries
            scopedDictionary: [],
            // avoid multiple XHR issued due to files not loaded
            scopeLoading: [],
            // location of the resource file
            url: undefined,
            // flag to indicate if the service hs loaded the resource file
            resourceFileLoaded: false,

            // success handler for all server communication
            successCallback: function (data, scope) {
                if (scope) {
                    localize.scopedDictionary[scope] = data;
                    localize.scopeLoading[scope] = false;
                } else {
                    // store the returned array in the dictionary
                    localize.dictionary = data;
                }
                // set that the resource are loaded
                localize.resourceFileLoaded = true;
                // broadcast that the file has been loaded
                $rootScope.$broadcast('localizeResourcesUpdated');
            },

            // allows setting of language on the fly
            setLanguage: function (value) {
                localize.language = value;
                localize.initLocalizedResources();
            },

            // allows setting of resource url on the fly
            setUrl: function (value) {
                localize.url = value;
                localize.initLocalizedResources();
            },

            // builds the url for locating the resource file
            buildUrl: function (scope) {
                if (!localize.language) {
                    var lang, androidLang;
                    // works for earlier version of Android (2.3.x)
                    if ($window.navigator && $window.navigator.userAgent && (androidLang = $window.navigator.userAgent.match(/android.*\W(\w\w)-(\w\w)\W/i))) {
                        lang = androidLang[1];
                    } else {
                        // works for iOS, Android 4.x and other devices
                        lang = $window.navigator.userLanguage || $window.navigator.language;
                    }
                    // set language
                    localize.language = lang;
                }
                return 'i18n/' + (scope ? scope + '/' : '') + 'resources-locale_' + localize.language + '.json';
            },

            // loads the language resource file from the server
            initLocalizedResources: function (scope) {
                // build the url to retrieve the localized resource file
                var url = scope ? localize.buildUrl(scope) : localize.url || localize.buildUrl();
                // request the resource file
                $http({ method: "GET", url: url, cache: false })
                    .success(function(data) {
                        localize.successCallback(data, scope);
                    })
                    .error(function () {
                        // the request failed set the url to the default resource file
                        var url = 'i18n/' + (scope ? scope + '/' : '') + 'resources-locale_default.json';
                        // request the default resource file
                        $http({ method: "GET", url: url, cache: false })
                            .success(function(data) {
                                localize.successCallback(data, scope);
                            })
                            .error(function() {
                                // avoid loop of hell in case scopedDic doesn't exists
                                localize.scopedDictionary[scope] = [];
                                localize.scopeLoading[scope] = false;
                            });
                    });
            },

            // returns scoped dic, if not present, issues a loading
            getScopedDictionary: function(scope) {
                var dic = localize.scopedDictionary[scope];
                if (!dic) {
                    if (!localize.scopeLoading[scope]) {
                        localize.scopeLoading[scope] = true;
                        localize.initLocalizedResources(scope);
                    }
                    dic = [];
                }
                return dic;
            },

            // checks the dictionary for a localized resource string
            getLocalizedString: function (value, scope) {
                // default the result to an empty string
                var result = '';
                var dic;
                //
                if (!scope) {
                    dic = localize.dictionary;
                } else {
                    dic = localize.getScopedDictionary(scope);
                }
                // if something is wrong, bad things will happens without this check..
                if (dic) {
                    // make sure the dictionary has valid data
                    if ((dic !== []) && (dic.length > 0)) {
                        // use the filter service to only return those entries which match the value
                        // and only take the first result
                        var entry = $filter('filter')(dic, function (element) {
                                return element.key === value;
                            }
                        )[0];

                        // set the result
                        result = entry.value;
                    }
                }
                // return the value to the call
                return result;
            }
        };

        // force the load of the resource file
        localize.initLocalizedResources();

        // return the local instance when called
        return localize;
    } ])
    // simple translation filter
    // usage {{ TOKEN | i18n }}
    // usage {{ TOKEN | i18n:'scopeName' }}
    .filter('i18n', ['localize', function (localize) {
        return function (input, scope) {
            return localize.getLocalizedString(input, scope);
        };
    }])
    // translation directive that can handle dynamic strings
    // updates the text value of the attached element
    // usage <span data-i18n="TOKEN" ></span>
    // or
    // <span data-i18n="TOKEN|VALUE1|VALUE2" ></span>
    .directive('i18n', ['localize', function (localize) {
        var i18nDirective = {
            restrict: "EAC",
            updateText: function (elm, token) {
                var values = token.split('|');
                if (values.length >= 1) {
                    // construct the tag to insert into the element
                    var tag = localize.getLocalizedString(values[0]);
                    // update the element only if data was returned
                    if ((tag !== null) && (tag !== undefined) && (tag !== '')) {
                        if (values.length > 1) {
                            for (var index = 1; index < values.length; index++) {
                                var target = '{' + (index - 1) + '}';
                                tag = tag.replace(target, values[index]);
                            }
                        }
                        // insert the text into the element
                        elm.text(tag);
                    }
                    ;
                }
            },

            link: function (scope, elm, attrs) {
                scope.$on('localizeResourcesUpdated', function () {
                    i18nDirective.updateText(elm, attrs.i18n);
                });

                attrs.$observe('i18n', function (value) {
                    i18nDirective.updateText(elm, attrs.i18n);
                });
            }
        };

        return i18nDirective;
    }])
    // translation directive that can handle dynamic strings
    // updates the attribute value of the attached element
    // usage <span data-i18n-attr="TOKEN|ATTRIBUTE" ></span>
    // or
    // <span data-i18n-attr="TOKEN|ATTRIBUTE|VALUE1|VALUE2" ></span>
    .directive('i18nAttr', ['localize', function (localize) {
        var i18NAttrDirective = {
            restrict: "EAC",
            updateText: function (elm, token) {
                var values = token.split('|');
                // construct the tag to insert into the element
                var tag = localize.getLocalizedString(values[0]);
                // update the element only if data was returned
                if ((tag !== null) && (tag !== undefined) && (tag !== '')) {
                    if (values.length > 2) {
                        for (var index = 2; index < values.length; index++) {
                            var target = '{' + (index - 2) + '}';
                            tag = tag.replace(target, values[index]);
                        }
                    }
                    // insert the text into the element
                    elm.attr(values[1], tag);
                }
            },
            link: function (scope, elm, attrs) {
                scope.$on('localizeResourcesUpdated', function () {
                    i18NAttrDirective.updateText(elm, attrs.i18nAttr);
                });

                attrs.$observe('i18nAttr', function (value) {
                    i18NAttrDirective.updateText(elm, value);
                });
            }
        };

        return i18NAttrDirective;
    }]);