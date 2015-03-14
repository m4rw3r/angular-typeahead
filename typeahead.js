"use strict";

var ACTIVE_CLASS   = "d-typeahead__active";
var KEY_ARROW_DOWN = 40;
var KEY_ARROW_UP   = 38;
var KEY_ENTER      = 13;
var KEY_ESC        = 27;

/**
 * Flexible typeahead directive.
 *
 * Example:
 * <code>
 *     <d-typeahead item-query="listUsers(prefix)"
 *                  item-text="item.email"
 *                  item-max="10"
 *                  item-active-class="d-typeahead__active"
 *                  ng-model="selectedUser"
 *                  ng-required="true">
 *       <li>{{::item.email}}</li>
 *     </d-typeahead>
 * </code>
 */
dTypeahead.$inject = ["$timeout"];
function dTypeahead($timeout) {
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
      activeClass: "@itemActiveClass"
    },
    template: "<div>" +
      "<input type=\"text\" ng-model=\"text\" ng-model-options=\"{debounce: 100}\" />" +
      "<ul ng-transclude ng-show=\"items.length > 0 && showList\"></ul>" +
    "</div>",
    link: function($scope, elem, attrs, ngModel, $transclude) {
      /* The latest issued call to elem-query */
      var currentPromise = null;
      var itemListElem   = elem.find("ul");
      var inputElem      = elem.find("input");

      $scope.itemMax     = $scope.itemMax || 10;
      $scope.activeClass = $scope.activeClass || ACTIVE_CLASS;
      $scope.items       = [];
      $scope.text        = null;
      $scope.active      = null;
      $scope.showList    = false;

      function toText(e) {
        return $scope.itemText({item: e});
      }

      /**
       * Selects a given item.
       * 
       * @param item
       * @param cont  If to still show the list, default false
       */
      $scope.select = function(i, cont) {
        if( ! i) {
          $scope.text           = "";
          $scope.active         = null;
          $scope.currentPromise = false;

          setItems([]);
        }
        else {
          $scope.text     = toText(i);
          $scope.active   = i;
          $scope.showList = cont || false;

          ngModel.$setViewValue(i);
        }
      };

      ngModel.$render = function() {
        $scope.select(ngModel.$viewValue);
      };

      function selectFromText(text) {
        if( ! text) {
          $scope.select(null);

          /* Not a match, keep model null */
          ngModel.$setViewValue(null);

          return true;
        }

        var idx = $scope.items.map(toText).indexOf(text);

        if(idx !== -1) {
          /* Let the user continue to choose */
          $scope.select($scope.items[idx], true);

          return true;
        }

        /* Not a match, keep model null */
        ngModel.$setViewValue(null);

        return false;
      }

      function setItems(items) {
        $scope.items    = items;
        $scope.active   = items[0] || null;
        $scope.showList = true;

        /* Clear the list and reinitialize with a whole
           new bunch of items */
        itemListElem.children().remove();

        items.forEach(function(i) {
          $transclude(function(iElem, iScope) {
            iScope.item = i;

            /* Child node link function */
            dTypeaheadElem(iElem, iScope, $scope);

            itemListElem.append(iElem);
          });
        });
      }

      $scope.$watch("text", function(newValue, oldValue) {
        /* If the value hasn't changed, or if we already have
           it selected or if it is something which we can select,
           then do not issue any queries */
        if(newValue === oldValue || newValue === toText(ngModel.$viewValue) || selectFromText(newValue)) {
          return;
        }

        if(newValue && oldValue && currentPromise && $scope.items.length < $scope.itemMax && newValue.indexOf(oldValue) === 0) {
          /* Skip query as we can filter locally */
          setItems($scope.items.filter(function(i) {
            return toText(i).indexOf(newValue) === 0;
          }));
        }
        else {
          /* Local copy of the promise, to use inside promise
             resolution code to determine if the result is still
             applicable.  */
          var p = (currentPromise = $scope.itemQuery({prefix: newValue}));

          if(typeof p.then === "function") {
            p.then(function(items) {
              /* Only populate items if it was the most current
                 issued promise. */
              if(currentPromise === p) {
                setItems(items);

                selectFromText($scope.text);
              }
            });
          }
          else {
            setItems(p);

            selectFromText($scope.text);
          }
        }
      });

      elem.on("keydown", function(e) {
        if(e.keyCode === KEY_ENTER && $scope.active !== ngModel.$viewValue) {
          /* Only handle enter click if the user has not already selected something */
          e.preventDefault();

          $scope.select($scope.active);
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

      inputElem.on("focus", function() {
        $scope.$apply(function() {
          $scope.showList = true;
        });
      });

      inputElem.on("blur", function() {
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

function dTypeaheadElem(elem, $scope, $parent) {
  elem.on("click", function() {
    $parent.select($scope.item);
  });

  var destroy = $parent.$watch("active", function() {
    if($parent.active === $scope.item) {
      elem.addClass($parent.activeClass);
    }
    else {
      elem.removeClass($parent.activeClass);
    }
  });
  
  elem.on("$destroy", function() {
    destroy();
  });
}

angular.module("dTypeahead", [])
  .directive("dTypeahead", dTypeahead);
