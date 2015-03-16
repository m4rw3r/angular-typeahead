(function(angular) {
  "use strict";

  var ACTIVE_CLASS   = "mw-typeahead--active";
  var KEY_ARROW_DOWN = 40;
  var KEY_ARROW_UP   = 38;
  var KEY_ENTER      = 13;
  var KEY_ESC        = 27;

  function unit(a) {
    return a;
  }

  function contains(str) {
    return function(a) {
      return a.indexOf(str) === 0;
    };
  }

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
   * Flexible typeahead directive.
   *
   * Example:
   * <code>
   *     <mw-typeahead item-query="listUsers(prefix)"
   *                  item-text="item.email"
   *                  item-max="10"
   *                  item-active-class="mw-typeahead__active"
   *                  ng-model="selectedUser"
   *                  ng-required="true">
   *       <li>{{::item.email}}</li>
   *     </mw-typeahead>
   * </code>
   */
  mwTypeahead.$inject = ["$timeout"];
  function mwTypeahead($timeout) {
    return {
      restrict:   "E",
      replace:    true,
      require:    "^ngModel",
      transclude: true,
      scope:      {
        /* Expression to be evaluated with the parameter 'prefix'.
           Should return a promise of a list of items for the given prefix. */
        itemQuery:   "&itemQuery",
        /* Expression to be evaluated with the parameter 'item'.
           Should return a string representation of the item suitable for the
           typeahead */
        itemText:    "&itemText",
        /* Optional value of the maximum number of expected items in a
           result from itemQuery. If the number of items returned is fewer
           then the typeahead will stop querying if the user continues
           with the same search-term. */
        itemMax:     "@itemMax",
        /* Optional value of the class to apply to active items in the
           suggestion list. Default value is "d-typeahead__actice". */
        activeClass: "@itemActiveClass",
        /* If the item is case-sensitive, default: true */
        caseSensitive: "@caseSensitive"
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
        var caseSensitive  = fromBool(attrs.caseSensitive, true);
        /* Cut off for internal filtering */
        var itemMax        = attrs.itemMax ? parseInt(attrs.itemMax, 10) : 10;
        /* Class added to active item */
        var activeClass    = attrs.activeClass || ACTIVE_CLASS;
        /* By default just passthrough as we're case-sensitive by default */
        var normalize      = unit;
   
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
            $scope.showList = !!showList;
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
            /* Only populate items if it was the most current
               issued promise. */
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
            $scope.showList = true;
          });
        });

        elInput.on("blur", function() {
          /* Timeout required to avoid hiding the list
             before clicks can be registered. */
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
    .directive("mwTypeahead", mwTypeahead);
})(angular);
