/** Auto generated file, do not edit, run rake framework_models:update_js */
import EnumValue from './EnumValue';

export class Enum {
  /** @type {Record<string, Enum>}> */
  static enums = {};

  constructor(name, values) {
    this.name = name;
    this.values = values;

    values.forEach(value => {
      Object.defineProperty(this, value, {
        get() {
          return new EnumValue(name, value);
        },
      });
    });

    Enum.enums[name] = this;
  }
}

/** @type {Aha.AttachmentSizeEnum} */
export const AttachmentSizeEnum = new Enum('AttachmentSizeEnum', [
  'MINI',
  'MEDIUM',
  'ORIGINAL',
]);

/** @type {Aha.AvatarSizeEnum} */
export const AvatarSizeEnum = new Enum('AvatarSizeEnum', [
  'SIZE_16',
  'SIZE_24',
  'SIZE_32',
  'SIZE_40',
  'SIZE_160',
]);

/** @type {Aha.EpicOrder} */
export const EpicOrder = new Enum('EpicOrder', [
  'workflowBoardPosition',
  'createdAt',
  'position',
]);

/** @type {Aha.ExtensionFieldableTypeEnum} */
export const ExtensionFieldableTypeEnum = new Enum(
  'ExtensionFieldableTypeEnum',
  ['EPIC', 'FEATURE', 'REQUIREMENT']
);

/** @type {Aha.FeatureOrder} */
export const FeatureOrder = new Enum('FeatureOrder', [
  'workflowBoardPosition',
  'createdAt',
  'updatedAt',
  'position',
  'featureBoardPosition',
]);

/** @type {Aha.InternalMeaning} */
export const InternalMeaning = new Enum('InternalMeaning', [
  'NOT_STARTED',
  'IN_PROGRESS',
  'DONE',
  'SHIPPED',
  'WONT_DO',
  'ALREADY_EXISTS',
]);

/** @type {Aha.IterationOrder} */
export const IterationOrder = new Enum('IterationOrder', ['startDate']);

/** @type {Aha.NotificationOrder} */
export const NotificationOrder = new Enum('NotificationOrder', ['createdAt']);

/** @type {Aha.NotificationReadEnum} */
export const NotificationReadEnum = new Enum('NotificationReadEnum', [
  'READ',
  'UNREAD',
]);

/** @type {Aha.NotificationScopeEnum} */
export const NotificationScopeEnum = new Enum('NotificationScopeEnum', [
  'PARTICIPATING',
  'WATCHING',
]);

/** @type {Aha.NotificationStarredEnum} */
export const NotificationStarredEnum = new Enum('NotificationStarredEnum', [
  'STARRED',
  'UNSTARRED',
]);

/** @type {Aha.NotificationTypeEnum} */
export const NotificationTypeEnum = new Enum('NotificationTypeEnum', [
  'Comment',
  'Project',
  'Task',
  'Release',
  'Epic',
  'Feature',
]);

/** @type {Aha.OrderDirection} */
export const OrderDirection = new Enum('OrderDirection', ['ASC', 'DESC']);

/** @type {Aha.RecordPlacementEnum} */
export const RecordPlacementEnum = new Enum('RecordPlacementEnum', [
  'TOP',
  'BOTTOM',
]);

/** @type {Aha.ReleaseOrder} */
export const ReleaseOrder = new Enum('ReleaseOrder', ['featuresBoardOrder']);

/** @type {Aha.RequirementOrder} */
export const RequirementOrder = new Enum('RequirementOrder', [
  'workflowBoardPosition',
  'createdAt',
  'updatedAt',
  'position',
]);

/** @type {Aha.TaskStatusEnum} */
export const TaskStatusEnum = new Enum('TaskStatusEnum', [
  'PENDING',
  'COMPLETE',
  'APPROVED',
  'APPROVED_CONDITIONALLY',
  'REJECTED',
  'SKIPPED',
]);

/** @type {Aha.TaskUserOrder} */
export const TaskUserOrder = new Enum('TaskUserOrder', ['completedDate']);

/** @type {Aha.WorkUnitEnum} */
export const WorkUnitEnum = new Enum('WorkUnitEnum', ['MINUTES', 'POINTS']);
