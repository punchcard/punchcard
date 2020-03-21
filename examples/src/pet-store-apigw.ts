import uuid = require("uuid");
import {ApiGateway, Core, DynamoDB, Lambda} from "punchcard";
import {Minimum, Shape, array, number, string} from "@punchcard/shape";
import {Record} from "@punchcard/shape";
// import { Build } from 'punchcard/lib/core/build';

export const app = new Core.App();

const stack = app.stack("pet-store");

// WARNING: this example will be changed - it does not properly descrive the Model and Velocity Templates yet.

class PetRecord extends Record({
  id: string,
  price: number,
  type: string,
}) {}

const petStore = new DynamoDB.Table(stack, "pet-store", {
  data: PetRecord,
  key: {
    partition: "id",
  },
});

const executorService = new Lambda.ExecutorService({
  memorySize: 512,
});

const endpoint = executorService.apiIntegration(stack, "MyEndpoint", {
  depends: petStore.readWriteAccess(),
});

const api = new ApiGateway.Api(stack, "PetApi");
const pets = api.addResource("pets");
const pet = pets.addResource("{id}");

class ErrorResponse extends Record({
  errorMessage: string,
}) {}

class EmptyPayload extends Record({}) {}

// GET /pets
pets.setGetMethod({
  handle: async (_, petStore) => {
    return ApiGateway.response(ApiGateway.StatusCode.Ok, await petStore.scan());
  },
  integration: endpoint,
  request: {
    shape: EmptyPayload,
  },
  responses: {
    // @ts-ignore
    [ApiGateway.StatusCode.Ok]: array(petStore.dataType),
    // @ts-ignore
    [ApiGateway.StatusCode.InternalError]: Shape.of(ErrorResponse),
  },
});

class PetId extends Record({
  id: string,
}) {}

// GET /pets/{id}
pet.setGetMethod({
  handle: async ({id}, petStore) => {
    const item = await petStore.get({id});
    if (item === undefined) {
      return ApiGateway.response(ApiGateway.StatusCode.NotFound, id);
    }
    return ApiGateway.response(ApiGateway.StatusCode.Ok, item);
  },
  integration: endpoint,
  request: {
    // @ts-ignore
    mappings: {
      id: ApiGateway.$input.params("id"),
    },
    // @ts-ignore
    shape: PetId,
  },
  responses: {
    // @ts-ignore
    [ApiGateway.StatusCode.Ok]: petStore.dataShape,
    [ApiGateway.StatusCode.NotFound]: string,
    // @ts-ignore
    [ApiGateway.StatusCode.InternalError]: Shape.of(ErrorResponse),
  },
});

class AddPetRequest extends Record({
  price: number.apply(Minimum(0)),
  type: string,
}) {}

// POST /pets
pets.setPostMethod({
  handle: async (request, petStore) => {
    const id = uuid();
    try {
      // @ts-ignore
      await petStore.put(new PetRecord({id, ...request}), {
        if: (_) => _.id.notExists(),
      });
      return ApiGateway.response(
        ApiGateway.StatusCode.Ok,
        new PetId({
          id,
        }),
      );
    } catch (error) {
      const e = error as AWS.AWSError;
      if (e.code === "ConditionalCheckFailedException") {
        return ApiGateway.response(
          ApiGateway.StatusCode.Conflict,
          `item with id ${id} already exists`,
        );
      } else {
        return ApiGateway.response(
          ApiGateway.StatusCode.InternalError,
          new ErrorResponse({
            errorMessage: e.message,
          }),
        );
      }
    }
  },
  integration: endpoint,
  request: {
    // @ts-ignore
    shape: AddPetRequest,
  },
  responses: {
    // @ts-ignore
    [ApiGateway.StatusCode.Ok]: Shape.of(PetId),
    [ApiGateway.StatusCode.Conflict]: string,
    // @ts-ignore
    [ApiGateway.StatusCode.InternalError]: Shape.of(ErrorResponse),
  },
});
