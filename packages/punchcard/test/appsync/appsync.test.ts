import 'jest';

import { array, boolean, integer, nothing, number, optional, Pointer, Record, RecordMembers, RecordShape, Shape, string, StringShape, timestamp } from '@punchcard/shape';
import { VFunction } from '@punchcard/shape/lib/function';
import { $else, $if, ApiFragment, ID, VTL, vtl } from '../../lib/appsync';
import { Api } from '../../lib/appsync/api';
import { Impl, Static, Trait, TraitFragment } from '../../lib/appsync/trait';
import { $util } from '../../lib/appsync/util';
import { App } from '../../lib/core';
import { Build } from '../../lib/core/build';
import { Scope } from '../../lib/core/construct';
import DynamoDB = require('../../lib/dynamodb');

// root of query interface
export class Query extends Record('Query', {}) {}

// root of mutation interface
export class Mutation extends Record('Mutation', {}) {}

export class User extends Record('User', {
  id: ID,
  alias: string,
}) {}

export class UserStore extends DynamoDB.Table.NewType({
  data: User,
  key: {
    partition: 'id'
  }
}) {}

/**
 * Trait for querying Users.
 *
 * Attachable/generic to any type, T.
 *
 * @typeparam T type to bind this trait to.
 */
export const GetUserTrait = Trait({
  /**
   * Get User by ID.
   */
  getUser: VFunction({
    args: { id: ID },
    returns: User
  })
});

/**
 * Trait for creating Users.
 *
 * @typeparam T type to bind this trait to.
 */
export const CreateUserTrait = Trait({
  createUser: VFunction({
    args: { alias: string },
    returns: User
  })
});

/**
 * A Post of some content in some category
 */
export class Post extends Record('Post', {
  /**
   * ID
   */
  id: ID,
  title: string,
  content: string,
  category: string,
  timestamp
}) {}

export class PostStore extends DynamoDB.Table.NewType({
  data: Post,
  key: {
    partition: 'id'
  }
}) {}

/**
 * A user record exposes a feed of `Post`.
 */
export const FeedTrait = Trait({
  feed: array(Post)
});

export const GetPostTrait = Trait({
  getPost: VFunction({
    args: { id: ID, },
    returns: Post
  })
});

export const CreatePostTrait = Trait({
  /**
   * Function documentation goes here.
   */
  createPost: VFunction({
    args: { title: string, content: string },
    returns: Post
  }),
});

export const RelatedPostsTrait = Trait({
  relatedPosts: array(Post)
});

/**
 * User API component - implements the query, mutation resolvers for Users.
 *
 * @param scope in which to install the component
 * @param props api to add UserAPI to
 */
export const UserApi = (
  scope: Scope,
  props: {
    postStore: PostStore,
    userStore?: UserStore
  }
) => {
  const userStore = props.userStore || new UserStore(scope, 'UserStore');

  const createUser = new CreateUserTrait(Mutation, {
    *createUser({alias}) {
      return yield* userStore.put({
        id: yield* $util.autoId(),
        alias,
      });
    }
  });

  const getUser = new GetUserTrait(Query, {
    *getUser({id}) {
      return yield* userStore.get({id});
    }
  });

  return {
    createUser,
    getUser,
    userStore,
  };
};

export const PostApi = (scope: Scope) => {
  // const postStore = new PostStore(scope, 'PostStore');
  const postStore = new PostStore(scope, 'PostStore');

  const getPost = new GetPostTrait(Query, {
    *getPost({id}) {
      return yield* postStore.get({
        id
      });
    }
  });

  const createPost = new CreatePostTrait(Mutation, {
    *createPost(input, self) {
      const id = yield* $util.autoId();
      const timestamp = yield* $util.time.nowISO8601();

      yield* $if(input.title.isEmpty(), function*() {
        const msg = yield* vtl(string)`Title must be non empty: ${input.title}`;
        yield* $util.error(msg);
      });

      const post = yield* postStore.put({
        id,
        title: input.title,
        content: input.content,
        timestamp,
        category: 'category'
      });

      return post;
    }
  });

  // const relatedPostIndex = postStore.globalIndex({
  //   indexName: 'related-posts',
  //   key: {
  //     partition: 'category',
  //     sort: 'timestamp'
  //   }
  // });

  // const relatedPosts = new RelatedPostsTrait(Post, {
  //   *relatedPosts(self) {
  //     throw new Error('not implemented');
  //     // return (yield* getPostFn.invoke(this.id)) as any;
  //   }
  // });

  return {
    getPost,
    createPost,
    postStore,
  };
};

const app = new App();
const stack = app.stack('stack');

const {createPost, getPost, postStore } = PostApi(stack);

const {createUser, userStore, getUser } = UserApi(stack, {
  postStore
});

export interface MyApi extends Static<typeof MyApi> {}

// instantiate an API with that type system
const MyApi = new Api(stack, 'MyApi', {
  name: 'MyApi',
  // root of query starts at the `Query` type
  query: 'Query',
  // root of mutation starts at the `Mutation` type
  mutation: 'Mutation',
  // concatenate all the fragments into a single type system
  types: ApiFragment.join(
    createUser,
    getPost,
    getUser,
    createPost,
  )
});

export function doStuffWithApi(api: MyApi) {}

it('should generate schema', () => {
  Build.resolve(MyApi.resource);
});
