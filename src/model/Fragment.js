import { immerable, produce } from 'immer';
import EnumValue from './EnumValue';
import { mapValues, isObject, isEqual } from 'lodash';

/** @typedef {{key:string; name:string; type: string, value: any}} FilterVariable */

/**
 * Holds partially generated fragments of graphql. Each fragment has a set of
 * props, a set of child fragments, an optional query, and a set of variables.
 *
 * Usage:
 *
 * ```
 * const fragment = new Fragment('features').attr('id', 'name');
 * fragment.toDocument();
 * ```
 *
 * Generates:
 *
 * ```
 * query Features {
 *   features {
 *     id
 *     name
 *   }
 * }
 * ```
 *
 * A slightly more complicated example:
 *
 * ```
 * const fragment = new Fragment('features', 'Feature')
 *  .attr('id')
 *  .fragment(new Fragment('requirements').attr('id', 'name'))
 *  .argument('workflowStatus', 123, 'ID')
 *  .resolve();
 * fragment.toDocument();
 * ```
 *
 * Generates:
 *
 * ```
 * query Features($workflowStatus: ID) {
 *   features(workflowStatus: $workflowStatus) {
 *     id
 *     requirements {
 *       id
 *       name
 *     }
 *   }
 * }
 * ```
 *
 * If a fragment is not given a name then it is considered to be a "virtual"
 * container, i.e. it just defers to it's selection:
 *
 * ```
 * const fragment = new Fragment()
 *   .fragment(new Fragment('feature').alias('feature_1').argument('id', 123).attr('id'))
 *   .fragment(new Fragment('feature').alias('feature_2').argument('id', 321).attr('id'))
 *   .resolve();
 * fragment.toDocument()
 * ```
 *
 * Generates:
 *
 * ```
 * query GetData($feature0id: ID!, $feature1id: ID!) {
 *   feature_1: feature(id: $feature0id) { id }
 *   feature_2: feature(id: $feature1id) { id }
 * }
 *
 * @type {Aha.Fragment}
 */
export default class Fragment {
  [immerable] = true;

  /**
   * @param {string} name
   * @param {string} type
   */
  constructor(name = null, type = null) {
    this.name = name;
    /** @type {boolean} */
    this._union = false;
    /** @type {string} */
    this._alias = undefined;
    this.type = type;
    /** @type {FilterVariable[]} */
    this.variables = [];
    /** @type {Fragment[]} */
    this.fragments = [];
    /** @type {string[]} */
    this.attrs = [];
  }

  /**
   * Add an attr or attrs to the fragment selection:
   *
   * ```
   * fragment.attr('id').toDocument() // { id }
   * ```
   *
   * @param  {...string} names
   * @returns {this}
   */
  attr(...names) {
    return produce(this, draft => {
      draft.attrs = [...this.attrs, ...names];
    });
  }

  /**
   * Set the alias of this fragment's selection
   *
   * @param {string} alias
   * @returns
   */
  alias(alias) {
    return produce(this, draft => {
      draft._alias = alias;
    });
  }

  /**
   * Add a child fragment or fragments
   *
   * ```
   * fragment.fragment(new Fragment('features').attr('id')).toDocument() // { features { id } }
   * ```
   *
   * @param  {...Fragment} fragments
   * @returns {this}
   */
  fragment(...fragments) {
    return produce(this, draft => {
      draft.fragments = [...this.fragments, ...fragments];
    });
  }

  /**
   * Add a variable or variables
   *
   * ```
   * fragment.variable({
   *   key: 'name',
   *   name: 'name',
   *   value: 'hello',
   *   type: 'String'
   * }).toVariables() // { name: 'hello' }
   * ```
   *
   * @param  {...FilterVariable} variables
   * @returns {this}
   */
  variable(...variables) {
    return produce(this, draft => {
      draft.variables = [...this.variables, ...variables];
    });
  }

  /**
   * @returns {this}
   */
  union() {
    return produce(this, draft => {
      draft._union = true;
    });
  }

  /**
   * @param {Fragment} other
   */
  canMerge(other) {
    try {
      this.merge(other);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Merge fragments. Fragments are mergable if the data they'd produce would be an intersection. For example:
   *
   *   new Fragment().attr('id').merge(new Fragment().attr('name')) === new Fragment().attr('id', 'name')
   *
   * This is mergable, id and name can intersect. However:
   *
   *   const fragOne = new Fragment().fragment(new Fragment('dynamicAttribute').argument('id', '123').attr('id'));
   *   const fragTwo = new Fragment().fragment(new Fragment('dynamicAttribute').argument('id', '321').attr('name'));
   *
   * The data would produce:
   *
   * query {
   *   dynamicAttribute(id: '123') { id }
   * }
   *
   * OR
   *
   * query {
   *   dynamicAttribute(id: '321') { name }
   * }
   *
   * and therefore these are not mergable. But if the id argument was the same then:
   *
   *   const fragOne = new Fragment().fragment(new Fragment('dynamicAttribute').argument('id', '123').attr('id'));
   *   const fragTwo = new Fragment().fragment(new Fragment('dynamicAttribute').argument('id', '123').attr('name'));
   *   const fragThree = fragOne.merge(fragTwo)
   *
   * this produces:
   *
   * query {
   *   dynamicAttribute(id: '123') {
   *      id
   *      name
   *   }
   * }
   *
   * @param {Fragment} other
   */
  merge(other) {
    if (!isEqual(this.variables, other.variables)) {
      throw new Error('Cannot merge fragments with different variables');
    }

    if (this._union || other._union) {
      throw new Error('Cannot merge union fragments');
    }

    return produce(this, draft => {
      draft.attrs = [...new Set([...this.attrs, ...other.attrs])];

      const otherFragments = other.fragments.slice(0);

      draft.fragments = this.fragments.map(fragment => {
        if (fragment.name) {
          const index = otherFragments.findIndex(
            f => f.name === fragment.name && f._alias === fragment._alias
          );

          if (index >= 0) {
            const otherFragment = otherFragments[index];
            otherFragments.splice(index, 1);
            return fragment.merge(otherFragment);
          }
        }

        return fragment;
      });

      if (otherFragments.length > 0) {
        draft.fragments = [...draft.fragments, ...otherFragments];
      }
    });
  }

  /**
   * Add a variable by name and value. The type is optional and will be guessed
   * if not given.
   *
   * ```
   * new Fragment('features').argument('name', 'hello').toQuery() // query Features($name: String) { ...
   * new Fragment('features').argument('id', '123', 'ID!').toQuery() // query Features($id: ID!) { ...
   * ```
   *
   * @param {string} name
   * @param {*} value
   * @param {(string|boolean)=} typeOrRequired
   * @returns {this}
   */
  argument(name, value, typeOrRequired) {
    let type = typeof typeOrRequired === 'string' ? typeOrRequired : null;

    if (value instanceof EnumValue) {
      type = value.type;
      value = value.value;
    }

    if (!type && name.toLowerCase().endsWith('id')) {
      type = 'ID!';
    }

    if (!type) {
      const types = {
        string: 'String',
        boolean: 'Boolean',
        number: 'Int',
      };

      if (Array.isArray(value) && value.length > 0) {
        const itemType = types[typeof value[0]];
        type = `[${itemType}]`;
      } else {
        type = types[typeof value];
      }
    }

    if (!type) {
      throw new Error(
        `Cannot use argument ${name} of type ${typeof value} in graphql query ${
          this.name
        }`
      );
    }

    if (type && typeOrRequired === true) {
      type = `${type}!`;
    }

    return this.variable({ key: name, name: name, type, value });
  }

  /**
   * Once a fragment is ready to use to produce a query, it's possible that
   * there are duplicate variable names at different levels. For example:
   *
   * ```
   * const root = new Fragment('feature', 'Feature');
   * root.variables = {workflowStatus: {name: 'workflowStatus', type: 'ID', value: 123 }};
   * root.query = 'features';
   *
   * const child = new Fragment('requirements', 'Requirement');
   * child.variables = {workflowStatus: {name: 'workflowStatus', type: 'ID', value: 321 }};
   * child.query = 'features';
   *
   * root.fragments = [child];
   * root.toParameters(); // [['workflowStatus', 'ID']] we can only supply one workflowStatus
   * ```
   *
   * In the above code we'll only be able to supply one `workflowStatus`
   * variable. We need a different one for features and requirements. So resolve
   * travels down the tree and names each variable after the fragment:
   *
   * ```
   * const newRoot = root.resolve();
   * newRoot.toParameters(); // [['workflowStatus', 'ID'], ['requirements_Requirement_workflowStatus', 'ID]]
   * ```
   *
   * Now we get the appropriate parameters. The `toVariables()` function will
   * produce the right values so there is no need to know the naming.
   *
   * @returns {this}
   */
  resolve() {
    return produce(this, draft => {
      draft.fragments = draft.fragments.map((f, idx) =>
        f._resolveRename(String(idx))
      );
    });
  }

  /**
   * Rename fragment variables for resolution. This is the function called on
   * all non-root fragments recursively.
   *
   * @hidden
   * @param {string} id
   * @returns {this}
   */
  _resolveRename(id) {
    return produce(this, draft => {
      draft.fragments = draft.fragments.map((f, idx) =>
        f._resolveRename(`${id}_${idx}`)
      );

      draft.variables = draft.variables.map(old => {
        const name = `${this.name}${id}${old.name}`;
        return { ...old, name };
      });
    });
  }

  /**
   * Deeply prepares variable values for variable generation. For
   * example, correctly outputs enum values inside arrays and objects.
   *
   * @hidden
   * @param {any} value
   * @returns {any}
   */
  _toVariableValue(value) {
    if (value instanceof EnumValue) {
      return value.value;
    }

    if (Array.isArray(value)) {
      return value.map(v => this._toVariableValue(v));
    }

    if (isObject(value)) {
      return mapValues(value, v => this._toVariableValue(v));
    }

    return value;
  }

  /**
   * Generate the variables to be passed when this fragment is queried.
   *
   * @returns {Record<string, any>}
   */
  toVariables() {
    return this.fragments.reduce(
      (acc, f) => ({ ...acc, ...f.toVariables() }),
      this.variables.reduce(
        (acc, v) => ({ ...acc, [v.name]: this._toVariableValue(v.value) }),
        {}
      )
    );
  }

  /**
   * Generate a set of key value pairs where the key is a variable name and the
   * value is the variable's graphql type. These can be used to construct a
   * query function parameter list.
   *
   * @returns {Array<[string, string]>}
   */
  toParameters() {
    return this.fragments.reduce(
      (acc, f) => [...acc, ...f.toParameters()],
      this.variables.reduce((acc, v) => [...acc, [v.name, v.type]], [])
    );
  }

  /**
   * Turn the attrs into field nodes
   *
   * @private
   * @return {import('graphql').FieldNode[]}
   */
  fieldNodes() {
    return this.attrs.map(attr => {
      return {
        kind: 'Field',
        name: nameKind(attr),
      };
    });
  }

  /**
   * Generate the inner selection set. This selection joins the fields with the
   * child fragments.
   *
   * @private
   * @return {import('graphql').SelectionSetNode}
   */
  selectionSet() {
    return {
      kind: 'SelectionSet',
      selections: [
        ...this.fieldNodes(),
        ...this.fragments.map(f => f.toSelection()),
      ],
    };
  }

  /**
   * Generate the selection for this Fragment. This will be a Field node or an
   * InlineFragment node
   *
   * @private
   * @returns {import('graphql').SelectionNode}
   */
  toSelection() {
    const selectionSet = this.selectionSet();

    if (this._union) {
      return {
        kind: 'InlineFragment',
        typeCondition: namedTypeKind(this.type),
        selectionSet,
      };
    }

    /** @type {import('graphql').SelectionNode} */
    let selection = {
      kind: 'Field',
      name: nameKind(this.name),
      arguments: this.variables.map(v => variableArgument(v.key, v.name)),
      // If the selection set is empty then do not add it to the field
      selectionSet:
        selectionSet.selections.length > 0 ? selectionSet : undefined,
    };

    if (this._alias) {
      selection = { ...selection, alias: nameKind(this._alias) };
    }

    return selection;
  }

  /**
   * Generate a top level selection set for this Fragment
   *
   * @private
   * @returns {import('graphql').SelectionSetNode}
   */
  toSelectionSet() {
    if (!this.name) return this.selectionSet();

    return {
      kind: 'SelectionSet',
      selections: [this.toSelection()],
    };
  }

  /**
   * Generate a graphql document node from the fragment tree
   *
   * @param {string} name
   * @param {import('graphql').OperationTypeNode} operation
   * @return {import('graphql').DocumentNode}
   */
  toDocument(name = this.name, operation = 'query') {
    return {
      kind: 'Document',
      definitions: [
        {
          kind: 'OperationDefinition',
          operation,
          name: nameKind(name || 'GetData'),
          variableDefinitions: this.toParameters().map(([name, type]) =>
            variableDefinition(name, type)
          ),
          selectionSet: this.toSelectionSet(),
        },
      ],
    };
  }
}

/** Helpers for generating graphql nodes */

/**
 * @param {string} name
 * @param {string} type
 * @return {import('graphql').VariableDefinitionNode}
 */
function variableDefinition(name, type) {
  return {
    kind: 'VariableDefinition',
    variable: {
      kind: 'Variable',
      name: nameKind(name),
    },
    type: namedTypeKind(type),
  };
}

/**
 * @param {string} arg
 * @param {string} name
 * @returns {import('graphql').ArgumentNode}
 */
function variableArgument(arg, name) {
  return {
    kind: 'Argument',
    name: nameKind(arg),
    value: { kind: 'Variable', name: nameKind(name) },
  };
}

/**
 * @param {string} value
 * @returns {import('graphql').NameNode}
 */
function nameKind(value) {
  if (typeof value !== 'string') {
    throw new Error('value given to nameKind is not a name (string)');
  }

  return {
    kind: 'Name',
    value,
  };
}

/**
 * @param {string} value
 * @returns {import('graphql').NamedTypeNode}
 */
function namedTypeKind(value) {
  return {
    kind: 'NamedType',
    name: nameKind(value),
  };
}
