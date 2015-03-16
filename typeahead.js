(function(angular) {
  "use strict";

  var KEY_ARROW_DOWN = 40;
  var KEY_ARROW_UP   = 38;
  var KEY_ENTER      = 13;
  var KEY_ESC        = 27;
  
  var CONFIG_DEFAULTS = {
    activeClass:   "mw-typeahead__item--active",
    caseSensitive: true,
    itemMax:       10
  };

  function identity(a) {
    return a;
  }

  function contains(str) {
    return function(a) {
      return a.indexOf(str) === 0;
    };
  }

  /**
   * Function attempting to parse a boolean from a string.
   * 
   * @param  {*}
   * @param  {*=}
   * @return {boolean|*}  Boolean or the value set as defaultValue
   */
  function fromBool(maybeStr, defaultValue) {
    switch(typeof maybeStr === "string" ? maybeStr.toLowerCase().trim() : "") {
      case "true":
        return true;
      case "false":
        return false;
      default:
        return defaultValue;
    }
  }

  /**
   * Provider for global configuration of defaults.
   * 
   * @constructor
   */
  function MwTypeaheadConfigProvider() {
    this._config = angular.extend({}, CONFIG_DEFAULTS);
    this.$get    = function() {
      return this._config;
    };
    
    /**
     * Sets the default class-name which will be applied to highlighted
     * items in the suggestion-list.
     * 
     * @param {string}
     */
    this.setActiveClass = function(klass) {
      this._config.activeClass = klass;
    };
    /**
     * Sets the default case-sensitivity setting for local matching
     * of item texts and input value.
     * 
     * @param {boolean}
     */
    this.setCaseSensitive = function(value) {
      this._config.caseSensitive = value;
    };
    /**
     * Sets the default expected maximum number of items returned from
     * the item-query expression.
     * 
     * @param {number}
     */
    this.setItemMax = function(value) {
      this._config.maxItems = value;
    };
  }

  /**
   * Flexible typeahead directive.
   * 
   * Required attributes:
   *  * ng-model:
   *      The model instance to put the selected value in, standard
   *      angularjs directive.
   *  * item-query:
   *      The expression to evaluate to retrieve additional items,
   *      can return a populated array or a promise of one. In the expression
   *      the parameter ``prefix`` will be set to the user-typed string in the
   *      expression.
   *  * item-text:
   *      The expression evaluated for each item when performing offline
   *      filtering, matching against entered text and filling the input when
   *      the model is selected.
   * 
   * Optional attributes:
   *  * item-max:
   *      The expected maximum number of items in the response from the
   *      item-query expression. If the number of items returned is less than
   *      this the typeahead directive will exclusively use offline filtering
   *      against the evaluated item-text expressions.
   *      
   *      Default: 10
   *      
   *  * active-class:
   *      The class name applied to the highlighted item in the typeahead
   *      suggestion-list.
   *      
   *      Default: "mw-typeahead__item--active"
   *      
   *  * case-sensitive:
   *      If the matching on item-text should be case-sensitive or not.
   *      
   *      Default: true
   *
   * All of the defaults of the optional attributes can be changed via the
   * mwTypeaheadConfig provider.
   * 
   * Example:
   * <code>
   *   <mw-typeahead item-query="listUsers(prefix)"
   *                 item-text="item.email"
   *                 ng-model="selectedUser"
   *                 ng-required="true">
   *      <li>{{::item.email}}</li>
   *   </mw-typeahead>
   * </code>
   */
  mwTypeahead.$inject = ["mwTypeaheadConfig", "$timeout"];
  function mwTypeahead(config, $timeout) {
    return {
      restrict:   "E",
      replace:    true,
      require:    "^ngModel",
      transclude: true,
      scope:      {
        /* Expression to be evaluated with the parameter 'prefix'.
           Should return a list of items or a promise of a list of items for the given prefix. */
        itemQuery:   "&itemQuery",
        /* Expression to be evaluated with the parameter 'item'.
           Should return a string representation of the item suitable for the
           typeahead */
        itemText:    "&itemText",
      },
      template: "<div>" +
        "<input type=\"text\" ng-model=\"text\" ng-model-options=\"{debounce: 100}\" />" +
        "<ul ng-show=\"items.length > 0 && showList\"></ul>" +
      "</div>",
      link: function($scope, elem, attrs, ngModel, $transclude) {
        var elItemList     = elem.find("ul");
        var elInput        = elem.find("input");
        /* The latest issued call to elem-query */
        var currentPromise = null;
        /* If the internal matching and filtering should be case-sensitive */
        var caseSensitive  = fromBool(attrs.caseSensitive, config.caseSensitive);
        /* Cut off for internal filtering */
        var itemMax        = attrs.itemMax ? parseInt(attrs.itemMax, 10) : config.itemMax;
        /* Class added to active item */
        var activeClass    = attrs.activeClass || config.activeClass;
        /* By default just passthrough as we're case-sensitive by default */
        var normalize      = identity;
   
        $scope.items       = [];
        $scope.text        = null;
        $scope.active      = null;
        $scope.showList    = false;

        function toText(e) {
          return $scope.itemText({item: e});
        }

        if( ! caseSensitive) {
          normalize = function(str) {
            return str.toLowerCase();
          };
        }

        /**
         * Selects a given item.
         * 
         * @param item
         * @param cont  If to still show the list, default false
         */
        function select(item, showList) {
          $scope.active = item;

          if( ! item) {
            $scope.text = "";
            /* Stop receiving data from promises when the list has been reset */
            currentPromise = false;

            setItems([]);
          }
          else {
            $scope.text     = toText(item);
            $scope.showList = showList ? $scope.items.length > 0 : false;
          }

          ngModel.$setViewValue(item);
        }

        function selectFromText(text) {
          if( ! text) {
            return select(null);
          }

          var itemTexts = $scope.items.map(toText).map(normalize);
          var matches   = itemTexts.filter(contains(normalize(text)));

          if(matches.length === 1) {
            /* Only one potential match, select it */
            var idx = itemTexts.indexOf(text);

            if(idx !== -1) {
              /* Let the user continue to choose */
              select($scope.items[idx], true);
            }
          }
        }

        function setItems(items) {
          $scope.items    = items;
          $scope.active   = items[0] || null;
          $scope.showList = items.length > 0;

          /* Clear the list and reinitialize with a whole
             new bunch of items */
          elItemList.children().remove();

          items.forEach(function(item) {
            $transclude(function(elItem, itemScope) {
              itemScope.item   = item;
              itemScope.select = select;

              mwTypeaheadElemLink(elItem, itemScope, $scope, activeClass);

              elItemList.append(elItem);
            });
          });
        }

        ngModel.$render = function() {
          select(ngModel.$viewValue);
        };

        $scope.$watch("text", function(newValue, oldValue) {
          /* If the value hasn't changed, or if we already have
             it selected, then do not issue any queries */
          if(newValue === oldValue || newValue === toText(ngModel.$viewValue)) {
            return;
          }

          /* Local copy of the promise, to use inside promise
             resolution code to determine if the result is still
             applicable.  */
          var p      = null;
          var update = function(items) {
            /* Only populate items if it was the most current issued promise. */
            if(currentPromise === p) {
              setItems(items);

              selectFromText($scope.text);
            }
          };

          if(newValue && oldValue &&
             $scope.items.length < itemMax && currentPromise &&
             newValue.indexOf(oldValue) === 0) {
            /* Skip query as we can filter locally */
            var needle = normalize(newValue);
    
            p = (currentPromise = $scope.items.filter(function(i) {
              return normalize(toText(i)).indexOf(needle) === 0;
            }));
          }
          else {
            p = (currentPromise = $scope.itemQuery({prefix: newValue}));
          }

          if(typeof p.then === "function") {
            p.then(update);
          }
          else {
            update(p);
          }
        });

        elem.on("keydown", function(e) {
          if(e.keyCode === KEY_ENTER && $scope.active !== ngModel.$viewValue) {
            /* Only handle enter click if the user has not already selected something */
            e.preventDefault();

            select($scope.active);
          }
          else if(e.keyCode === KEY_ARROW_DOWN) {
            e.preventDefault();

            $scope.$apply(function() {
              $scope.active = $scope.items[($scope.items.indexOf($scope.active) + 1) % $scope.items.length];
            });
          }
          else if(e.keyCode === KEY_ARROW_UP) {
            e.preventDefault();

            $scope.$apply(function(){
              var idx = $scope.items.indexOf($scope.active) - 1;

              $scope.active = $scope.items[idx < 0 ? $scope.items.length - 1 : idx];
            });
          }
          else if(e.keyCode === KEY_ESC) {
            $scope.$apply(function() {
              $scope.showList = false;
            });
          }
        });

        elInput.on("focus", function() {
          $scope.$apply(function() {
            $scope.showList = $scope.items.length > 0;
          });
        });

        elInput.on("blur", function() {
          /* Timeout required to avoid hiding the list before clicks can be
             registered. */
          $timeout(function() {
            $scope.$apply(function() {
              $scope.showList = false;
            });
          }, 50);
        });
      }
    };
  }

  function mwTypeaheadElemLink(elem, $scope, $parent, activeClass) {
    elem.on("click", function() {
      $scope.select($scope.item);
    });

    var destroy = $parent.$watch("active", function() {
      if($parent.active === $scope.item) {
        elem.addClass(activeClass);
      }
      else {
        elem.removeClass(activeClass);
      }
    });
    
    elem.on("$destroy", function() {
      destroy();
    });
  }

  angular.module("mw-typeahead", [])
    .provider("mwTypeaheadConfig", MwTypeaheadConfigProvider)
    .directive("mwTypeahead", mwTypeahead);
})(angular);
