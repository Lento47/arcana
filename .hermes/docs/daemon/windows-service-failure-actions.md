# SERVICE_FAILURE_ACTIONSA (winsvc.h) - Win32 apps | Microsoft Learn

> Source: downloaded reference page

SERVICE_FAILURE_ACTIONSA (winsvc.h) - Win32 apps | Microsoft Learn

 Table of contents  Exit editor mode

Ask Learn Ask Learn
Reading mode Table of contents Read in English Add Add to Plans Edit Copy Markdown Print

Note

 Access to this page requires authorization. You can try  signing in  or  changing directories .

 Access to this page requires authorization. You can try  changing directories .

SERVICE_FAILURE_ACTIONSA structure (winsvc.h)

Feedback

 Summarize this article for me

Represents the action the service controller should take on each failure of a service. A service is considered failed when it terminates without reporting a status of  SERVICE_STOPPED  to the service controller.

To configure additional circumstances under which the failure actions are to be executed, see  SERVICE_FAILURE_ACTIONS_FLAG .

Syntax

typedef struct _SERVICE_FAILURE_ACTIONSA {
  DWORD     dwResetPeriod;
  LPSTR     lpRebootMsg;
  LPSTR     lpCommand;
  DWORD     cActions;
  SC_ACTION *lpsaActions;
} SERVICE_FAILURE_ACTIONSA, *LPSERVICE_FAILURE_ACTIONSA;

Members

dwResetPeriod

The time after which to reset the failure count to zero if there are no failures, in seconds. Specify  INFINITE  to indicate that this value should never be reset.

lpRebootMsg

The message to be broadcast to server users before rebooting in response to the  SC_ACTION_REBOOT  service controller action.

If this value is  NULL , the reboot message is unchanged. If the value is an empty string (""), the reboot message is deleted and no message is broadcast.

This member can specify a localized string using the following format:

@[ path ] dllname ,- strID

The string with identifier  strID  is loaded from  dllname ; the  path  is optional. For more information, see  RegLoadMUIString .

Windows Server 2003 and Windows XP:  Localized strings are not supported until Windows Vista.

lpCommand

The command line of the process for the  CreateProcess  function to execute in response to the  SC_ACTION_RUN_COMMAND  service controller action. This process runs under the same account as the service.

If this value is  NULL , the command is unchanged. If the value is an empty string (""), the command is deleted and no program is run when the service fails.

cActions

The number of elements in the  lpsaActions  array.

If this value is 0, but  lpsaActions  is not NULL, the reset period and array of failure actions are deleted.

lpsaActions

A pointer to an array of  SC_ACTION  structures.

If this value is NULL, the  cActions  and  dwResetPeriod  members are ignored.

Remarks

The service control manager counts the number of times each service has failed since the system booted. The count is reset to 0 if the service has not failed for  dwResetPeriod  seconds. When the service fails for the  N th time, the service controller performs the action specified in element [ N -1] of the  lpsaActions  array. If  N  is greater than  cActions , the service controller repeats the last action in the array.

Note

The winsvc.h header defines SERVICE_FAILURE_ACTIONS as an alias that automatically selects the ANSI or Unicode version of this function based on the definition of the UNICODE preprocessor constant. Mixing usage of the encoding-neutral alias with code that is not encoding-neutral can lead to mismatches that result in compilation or runtime errors. For more information, see  Conventions for Function Prototypes .

Requirements

Requirement Value

Minimum supported client Windows XP [desktop apps only]

Minimum supported server Windows Server 2003 [desktop apps only]

Header winsvc.h (include Windows.h)

See also

ChangeServiceConfig2

CreateProcess

QueryServiceConfig2

SC_ACTION

SERVICE_FAILURE_ACTIONS_FLAG

Feedback

 Was this page helpful?

Yes No No

 Need help with this topic?

 Want to try using Ask Learn to clarify or guide you through this topic?

Ask Learn Ask Learn
 Suggest a fix?

 Additional resources

Last updated on   2024-02-22

 Was this page helpful?

 Need help with this topic?

 Want to try using Ask Learn to clarify or guide you through this topic?

Ask Learn Ask Learn
 Suggest a fix?
