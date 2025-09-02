"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcrModule = void 0;
const cdk = require("aws-cdk-lib");
const ecr = require("aws-cdk-lib/aws-ecr");
const constructs_1 = require("constructs");
class EcrModule extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        if (props.importExisting !== false) {
            // Import an existing repository by name
            this.repository = ecr.Repository.fromRepositoryName(this, 'Repository', props.repositoryName);
        }
        else {
            // Create a new repository
            this.repository = new ecr.Repository(this, 'Repository', {
                repositoryName: props.repositoryName,
                imageScanOnPush: props.imageScanOnPush ?? true,
                removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
            });
        }
    }
}
exports.EcrModule = EcrModule;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWNyLW1vZHVsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVjci1tb2R1bGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLDJDQUEyQztBQUMzQywyQ0FBdUM7QUFVdkMsTUFBYSxTQUFVLFNBQVEsc0JBQVM7SUFHdEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFxQjtRQUM3RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLElBQUksS0FBSyxDQUFDLGNBQWMsS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUNuQyx3Q0FBd0M7WUFDeEMsSUFBSSxDQUFDLFVBQVUsR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxZQUFZLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ2hHLENBQUM7YUFBTSxDQUFDO1lBQ04sMEJBQTBCO1lBQzFCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7Z0JBQ3ZELGNBQWMsRUFBRSxLQUFLLENBQUMsY0FBYztnQkFDcEMsZUFBZSxFQUFFLEtBQUssQ0FBQyxlQUFlLElBQUksSUFBSTtnQkFDOUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxhQUFhLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNO2FBQy9ELENBQUMsQ0FBQztRQUNMLENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUFsQkQsOEJBa0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjciBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNyJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVjck1vZHVsZVByb3BzIHtcbiAgcmVwb3NpdG9yeU5hbWU6IHN0cmluZztcbiAgLy8gSWYgdHJ1ZSAoZGVmYXVsdCksIGltcG9ydCBleGlzdGluZyByZXBvc2l0b3J5IGJ5IG5hbWU7IGlmIGZhbHNlLCBjcmVhdGUgYSBuZXcgb25lXG4gIGltcG9ydEV4aXN0aW5nPzogYm9vbGVhbjtcbiAgaW1hZ2VTY2FuT25QdXNoPzogYm9vbGVhbjtcbiAgcmVtb3ZhbFBvbGljeT86IGNkay5SZW1vdmFsUG9saWN5O1xufVxuXG5leHBvcnQgY2xhc3MgRWNyTW9kdWxlIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHJlcG9zaXRvcnk6IGVjci5JUmVwb3NpdG9yeTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRWNyTW9kdWxlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgaWYgKHByb3BzLmltcG9ydEV4aXN0aW5nICE9PSBmYWxzZSkge1xuICAgICAgLy8gSW1wb3J0IGFuIGV4aXN0aW5nIHJlcG9zaXRvcnkgYnkgbmFtZVxuICAgICAgdGhpcy5yZXBvc2l0b3J5ID0gZWNyLlJlcG9zaXRvcnkuZnJvbVJlcG9zaXRvcnlOYW1lKHRoaXMsICdSZXBvc2l0b3J5JywgcHJvcHMucmVwb3NpdG9yeU5hbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDcmVhdGUgYSBuZXcgcmVwb3NpdG9yeVxuICAgICAgdGhpcy5yZXBvc2l0b3J5ID0gbmV3IGVjci5SZXBvc2l0b3J5KHRoaXMsICdSZXBvc2l0b3J5Jywge1xuICAgICAgICByZXBvc2l0b3J5TmFtZTogcHJvcHMucmVwb3NpdG9yeU5hbWUsXG4gICAgICAgIGltYWdlU2Nhbk9uUHVzaDogcHJvcHMuaW1hZ2VTY2FuT25QdXNoID8/IHRydWUsXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IHByb3BzLnJlbW92YWxQb2xpY3kgPz8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG59XG5cblxuIl19