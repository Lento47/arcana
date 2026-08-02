# Service State Transitions - Win32 apps | Microsoft Learn

> Source: downloaded reference page

Service State Transitions - Win32 apps | Microsoft Learn

 Table of contents  Exit editor mode

Ask Learn Ask Learn
Reading mode Table of contents Read in English Add Add to Plans Edit Copy Markdown Print

Note

 Access to this page requires authorization. You can try  signing in  or  changing directories .

 Access to this page requires authorization. You can try  changing directories .

Service State Transitions

Feedback

 Summarize this article for me

A service is responsible for reporting changes in its state to the service control manager (SCM). Service control programs and the system can find out the state of a service only from the SCM, so it is important that a service report its state correctly. A service reports its state by calling the  SetServiceStatus  function with a pointer to a fully initialized  SERVICE_STATUS  structure. The  dwCurrentState  member of the structure contains the service state to be reported.

The initial state of a service is SERVICE_STOPPED. When the SCM starts the service, it sets the service state to SERVICE_START_PENDING and calls the service's  ServiceMain  function. The service then completes its initialization using one of the techniques described in  Service ServiceMain Function . After the service completes its initialization and is ready to start receiving control requests, the service calls  SetServiceStatus  to report SERVICE_RUNNING and specify the control requests the service is prepared to accept. The transition from SERVICE_START_PENDING to SERVICE_RUNNING indicates to the SCM and service-monitoring tools that the service has started successfully. If the service reports a state other than SERVICE_RUNNING, the SCM or service-monitoring tools might mark the service as having failed to start.

The SCM sends only the specified control requests to the service (except for the SERVICE_CONTROL_INTERROGATE request, which is always sent). For a list of the control requests that a service can accept, see the  dwControlsAccepted  member of the  SERVICE_STATUS  structure. For information about registering to receive device events, see the  RegisterDeviceNotification  function.

The service state typically changes as a result of handling a control request. Control requests that cause the service state to change include SERVICE_CONTROL_STOP, SERVICE_CONTROL_PAUSE, and SERVICE_CONTROL_CONTINUE. If the service must do lengthy processing to handle any of these requests, it should create a secondary thread to perform the lengthy processing and report the corresponding pending state to the SCM. (For best performance on Windows Vista and later versions of Windows, the service should use a worker thread from a  thread pool  for this purpose.) The service should then report the completed state transition when the lengthy processing is finished. For more information about handling control requests, see  Service Control Handler Function .

Only certain service state transitions are valid. The following diagram shows the valid transitions.

The service state reported to the SCM determines how the SCM interacts with the service. For example, if a service reports SERVICE_STOP_PENDING, the SCM does not transmit further control requests to the service because this state indicates that the service is shutting down. The next state reported by the service should be SERVICE_STOPPED because that is the only valid state after SERVICE_STOP_PENDING. However, if a service reports a transition that is not valid, the SCM does not fail the call.

The following diagram shows service state transitions in more detail, including the control requests initiated by a service control program (the service client) and the  SetServiceStatus  calls that a service makes to report state changes to the SCM. As mentioned earlier, the SCM sends only control requests that the service has specified it will accept, so a service might not receive all of the requests shown in the diagram.

Related topics

ControlService

ControlServiceEx

SetServiceStatus

Feedback

 Was this page helpful?

Yes No No

 Need help with this topic?

 Want to try using Ask Learn to clarify or guide you through this topic?

Ask Learn Ask Learn
 Suggest a fix?

 Additional resources

Last updated on   2021-01-07

 Was this page helpful?

 Need help with this topic?

 Want to try using Ask Learn to clarify or guide you through this topic?

Ask Learn Ask Learn
 Suggest a fix?
