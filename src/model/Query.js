import { print } from "graphql";
import { enableMapSet, immerable, produce } from "immer";
import { camelize, classify, pluralize } from "inflected";
import ApplicationModel from "./ApplicationModel";
import Fragment from "./Fragment";
import { memoize } from "../utils/memoize";
import { modelObject } from "./modelBuilder";

enableMapSet();

/**
 * @typedef {Record<string, string | {type:string}>} FilterTypes
 */
/**
 * @typedef {Record<string, Record<string, any>>} SelectionObject
 */
/**
 * @typedef {string | SelectionObject} Selection
 */

/**
 * A query builder for GraphQL queries. This is used to incrementally
 * create, save, and modify GraphQL queries without lots of string
 * processing.
 *
 * All query modifications return a new Query object, so previous versions
 * can be saved and reused.
 *
 * @template {typeof ApplicationModel} M
 * @template {InstanceType<M>} I
 */
export default class Query {
  [immerable] = true;

  /**
   * Creates a new Query for `model`
   *
   * @param {M=} model The model used as the result of the query
   */
  constructor(model) {
    this.model = model;
    /**
     * This is used to track the graphql types for filters. Subqueries will set
     * it to the field args from the model
     *
     * @type {Record<string, string|undefined>}
     */
    this.paramTypes = { filters: this.model?.filterType };

    this.attrs = new Set();
    this.arguments = {};
    this.filters = {};
    this.sort = {};
    /** @type {Record<string, Query<any, any>>} */
    this.subqueries = {};
    this._stats = new Set();
    this.single = false;
    /** @type {Record<string, Query<any, any>>} */
    this.unions = null;
  }

  /**
   * Adds `attrs` to the attributes selected by the query.
   *
   * Example: query.select(['id', 'name']);
   *
   * @param {...Selection[]} arguments
   * @returns {Query<M,I>} A Query object selecting `attrs`
   */
  select(attrs) {
    if (!attrs.forEach) {
      attrs = Array.from(arguments);
    }

    return produce(this, (draft) => {
      attrs.forEach((attr) => {
        draft.attrs.add(attr);
      });
    });
  }

  /**
   * Unions this query with another query, using GraphQL union
   * types. Should only be used in subqueries.
   *
   * Example: new Query(Epic).select(['id', 'name'])
   *            .union(new Query(Feature).select(['id', 'name']));
   *
   * @param {Query=} query The other query to union with this one
   * @returns {Query<M,I>} A Query object selecting `attrs`
   */
  union(query) {
    return produce(this, (draft) => {
      if (!draft.unions) {
        draft.unions = {};
        draft.unions[draft.model.typename] = produce(draft, (subQueryDraft) => {
          subQueryDraft.unions = {};
        });
      }

      if (query) {
        draft.unions[query.model.typename] = query;
      }
    });
  }

  /**
   * When paginating, adds `stats` to the page attributes selected by
   * the query.
   *
   * Example: query.stats(['isLastPage']);
   *
   * @param {string[]} attrs The attributes to select
   * @returns {Query<M,I>} A Query object selecting `attrs` on the page level
   */
  stats(attrs) {
    return produce(this, (draft) => {
      attrs.forEach((attr) => draft._stats.add(attr));
    });
  }

  /**
   * When paginating, selects page `pageNumber`
   *
   * Example: query.page(2)
   *
   * @param {Number} pageNumber The page number to select
   * @returns {Query<M,I>} A Query object selecting that page
   */
  page(pageNumber) {
    return this.argument({ page: pageNumber });
  }

  /**
   * When paginating, sets the number of results per page
   *
   * Example: query.per(50)
   *
   * @param {Number} perPage The number of results per page
   * @returns {Query<M,I>} An updated Query object
   */
  per(perPage) {
    return this.argument({ per: perPage });
  }

  /**
   * Adds bare, top-level arguments to the query
   *
   * Example: query.argument({timeout: 1000})
   *
   * @param {object} args The top-level arguments to add
   * @returns {Query<M,I>} An updated Query object
   */
  argument(args) {
    return produce(this, (draft) => {
      draft.arguments = { ...draft.arguments, ...args };
    });
  }

  /**
   * Adds filters to the query
   *
   * Example: query.where({projectId: 15})
   *
   * @param {object} filters The filters to add to the query
   * @returns {Query<M,I>} An updated Query object with those filters added
   */
  where(filters) {
    return this.rewhere({ ...this.filters, ...filters });
  }

  /**
   * Resets the filters on the query
   *
   * Example: query.rewhere({projectId: 15})
   *
   * @param {object} filters The filters to set on the query
   * @returns {Query<M,I>} An updated Query object with those filters added and all others removed
   */
  rewhere(filters) {
    return produce(this, (draft) => {
      draft.filters = filters;
    });
  }

  /**
   * Adds a criteria for ordering. Will be added to the end of the order list.
   *
   * Example: query.order({createdAt: 'ASC'});
   *
   * @param {object} criteria A one-key object where the key is an order attribute name and the value is a direction
   * @returns {Query<M,I>} An updated Query object with that order criteria added to it
   */
  order(criteria) {
    return this.reorder({ ...this.sort, ...criteria });
  }

  /**
   * Resets all criteria for ordering.
   *
   * Example: query.reorder({createdAt: 'ASC'});
   *
   * @param {object} criteria A one-key object where the key is an order attribute name and the value is a direction
   * @returns {Query<M,I>} An updated Query object with that order criteria set to it
   */
  reorder(criteria) {
    return produce(this, (draft) => {
      draft.sort = criteria ?? {};
    });
  }

  /**
   * When called, the query will select a single object instead of multiple.
   *
   * Example: query.first();
   *
   * @returns {Query<M,I>} An updated Query object selecting a single record
   */
  first() {
    return produce(this, (draft) => {
      draft.single = true;
    });
  }

  /**
   * Adds a subquery to select deeply nested records.
   *
   * Example: Workflow.select(['id']).merge({
   *   workflowStatuses: WorkflowStatus.select([
   *     'id',
   *     'name',
   *     'color',
   *     'position',
   *   ]),
   * });
   *
   * @param {object} subqueries The subqueries to merge into this query, where the key is an attribute name and the value is a Query object.
   * @returns {Query<M,I>} An updated Query object including the nested subqueries
   */
  merge(subqueries) {
    Object.entries(subqueries).forEach(([name, value]) => {
      subqueries = produce(subqueries, (draft) => {
        // Convert bare lists of columns into generic subqueries that
        // cannot run on their own.
        //
        // TODO: at the moment subqueries cannot be paginated. Only the top
        // level lists can be paginated and return nodes. This can be addressed
        // by adding metadata to the hasMany(). Right now just setting single=true
        if (Array.isArray(value)) {
          draft[name] = new Query().select(value).first();
        } else {
          draft[name] = produce(draft[name], (draft) => {
            draft.paramTypes = this.model.fields[name]?.args;
            draft.single = true;
          });
        }
      });
    });

    return produce(this, (draft) => {
      draft.subqueries = { ...draft.subqueries, ...subqueries };
    });
  }

  /**
   * Executes this query, finding a single record by ID.
   *
   * @param {string} id The object id to request
   * @returns {Promise<I|undefined>} The requested model, or undefined if it couldn't be found.
   */
  async find(id) {
    const query = this.argument({ id }).first();

    const data = await ApplicationModel.client.query(query.query, {
      variables: query.queryVariables,
    });

    if (data) {
      return modelObject(data, { query })[query.queryName];
    }
  }

  /**
   * Executes this query.
   *
   * @returns {Promise<import('./ModelCollection').default|undefined>} The requested models, or undefined if it couldn't be found.
   */
  async all() {
    const data = await ApplicationModel.client.query(this.queryString, {
      variables: this.queryVariables,
    });

    if (data) {
      return modelObject(data, { query: this })[this.queryName];
    }
  }

  /**
   * Fetch *all* records from multiple pages. `pageCallback` will be
   * called for each page as it arrives. If no callback is specified,
   * will return all of the records found. If a callback is specified,
   * it is assumed that the caller will handle the records, and the
   * return value will be empty.
   *
   * @param {function} [pageCallback] a callback called with a list of records for every page as it arrives
   * @returns {Promise<I[]>} An array of the requested records, if no callback is given
   */
  async findInBatches(pageCallback) {
    let currentPage = 1;
    let isLastPage = false;
    const totalRecords = [];
    pageCallback =
      pageCallback ??
      ((page) => totalRecords.push(...page.materializeRecords()));

    do {
      let page = await this.page(currentPage).stats(["isLastPage"]).all();

      await pageCallback(page);
      isLastPage = page.isLastPage || page.nodes.length === 0;
      currentPage++;
    } while (!isLastPage);

    return totalRecords;
  }

  /**
   * Returns the name for the query based on the model used to construct it.
   *
   * @returns {string} The query name
   */
  get queryName() {
    let queryName = camelize(this.model.typename, false);
    if (!this.single) {
      queryName = pluralize(queryName);
    }
    return queryName;
  }

  /**
   * Returns the name of the constructed graphql query
   */
  get queryFunctionName() {
    return classify(this.queryName);
  }

  /**
   * Returns the variables to send with the graphql query
   */
  get queryVariables() {
    return this.queryFragment.toVariables();
  }

  /**
   * Returns the parameter list to add to the graphql query based on the set
   * filters
   */
  get queryParametersString() {
    const params = this.queryFragment.toParameters();

    if (params.length === 0) return "";

    return (
      "(" + params.map(([name, type]) => `$${name}: ${type}`).join(", ") + ")"
    );
  }

  /**
   * Returns the DocumentNode version fo the GraphQL query
   */
  get query() {
    if (!this.model.typename) {
      throw new Error(
        `Model ${this.model} has no typename and thus cannot be used in query builder. Did you forget to add an annotation like \`static typename = 'releases';\` to the model class?`
      );
    }

    const fragment = this.queryFragment;
    return fragment.toDocument(this.queryFunctionName);
  }

  /**
   * Returns the plain string version of the GraphQL query corresponding to this object.
   *
   * @returns {string} A GraphQL query
   */
  get queryString() {
    return print(this.query);
  }

  /**
   * @returns {string?} the key that will likely be used to cache the result of
   * this query, or undefined if it cannot be determined from the information
   * in this query.
   */
  get cacheId() {
    if (this.single && this.arguments["id"] && this.attrs.has("id")) {
      return ApplicationModel.client.cacheId({
        __typename: this.model.name,
        ...this.filters,
        ...this.arguments,
      });
    }
  }

  /**
   * @hidden
   * @param {Fragment} fragment
   */
  buildFragmentArguments(fragment) {
    // Add the filter parameter
    if (this.filters && Object.keys(this.filters).length > 0) {
      fragment = fragment.argument(
        "filters",
        this.filters,
        this.paramTypes.filters
      );
    }

    // Add the sort parameter
    if (Object.keys(this.sort).length > 0) {
      fragment = fragment.argument(
        "order",
        Object.entries(this.sort).reduce(
          (acc, [name, direction]) => [...acc, { name, direction }],
          []
        ),
        `[${this.model.typename}OrderClause!]`
      );
    }

    // Add any additionally defined parameters (id, page, etc)
    fragment = Object.entries(this.arguments || {}).reduce(
      (fragment, [name, value]) =>
        fragment.argument(name, value, this.paramTypes[name]),
      fragment
    );

    return fragment;
  }

  /**
   * Either add the union fragments (if this is a union query) or the subqueries
   * and attributes, to a fragment
   *
   * @hidden
   * @param {Fragment} fragment
   */
  buildFragmentSubqueries(fragment) {
    // Get the fragments from the union queries. If there are any then they'll
    // take the place of this fragment
    const unionFragments = Object.values(this.unions || {}).map((query) =>
      query.buildQueryFragment(null, true)
    );

    if (unionFragments.length > 0) {
      return fragment.fragment(...unionFragments);
    } else {
      // Get all the subquery fragments and set their names to the subquery
      // attr
      const subqueryFragments = Object.entries(this.subqueries).map(
        ([name, subquery]) => subquery.buildQueryFragment(name)
      );

      const attrFragments = Array.from(this.attrs)
        .filter((attr) => typeof attr !== "string")
        .flatMap((/** @type {SelectionObject} */ attr) =>
          Object.entries(attr).map(([name, args]) =>
            Object.entries(args).reduce(
              (acc, [arg, value]) => acc.argument(arg, value),
              new Fragment(name)
            )
          )
        );

      return fragment
        .fragment(...subqueryFragments)
        .fragment(...attrFragments)
        .attr(
          ...Array.from(this.attrs).filter((attr) => typeof attr === "string")
        );
    }
  }

  /**
   * Build the graphql fragment tree for this query
   *
   * @hidden
   * @param {string} name
   * @param {boolean} union Indicates this query should be built as a union
   * @return {Fragment}
   */
  buildQueryFragment(name = this.queryName, union = false) {
    let fragment = new Fragment(name, this.model?.typename);

    if (union) {
      fragment = fragment.union();
    } else {
      fragment = this.buildFragmentArguments(fragment);
    }

    if (!union && !this.single) {
      // For list queries with paginated output we create a completely new
      // fragment that becomes the top level fragments only child, set the
      // query to 'nodes' and add all the attrs and subqueries to that
      return fragment
        .fragment(this.buildFragmentSubqueries(new Fragment("nodes")))
        .attr(...Array.from(this._stats));
    }

    return this.buildFragmentSubqueries(fragment);
  }

  /**
   * Get the resolved immutable graphql fragment tree for this query
   */
  get queryFragment() {
    return memoize(this, "queryFragment", () =>
      this.buildQueryFragment().resolve()
    );
  }
}
