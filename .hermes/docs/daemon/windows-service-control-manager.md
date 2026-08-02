# Service control manager - Win32 apps | Microsoft Learn

> Source: downloaded reference page

Service control manager - Win32 apps | Microsoft Learn

 Table of contents  Exit editor mode

Ask Learn Ask Learn
Reading mode Table of contents Read in English Add Add to Plans Edit Copy Markdown Print

Note

 Access to this page requires authorization. You can try  signing in  or  changing directories .

 Access to this page requires authorization. You can try  changing directories .

Service control manager

Feedback

 Summarize this article for me

The service control manager (SCM) is started at system boot. It's a remote procedure call (RPC) server, so that service configuration and service control programs can manipulate services on remote machines.

The service functions provide an interface for the following tasks performed by the SCM:

Maintaining the database of installed services.

Starting services and driver services either upon system startup or upon demand.

Enumerating installed services and driver services.

Maintaining status information for running services and driver services.

Transmitting control requests to running services.

Locking and unlocking the service database.

The following sections describe the SCM in more detail:

Database of installed services

Automatically starting services

Starting services on demand

Service record list

SCM handles

Feedback

 Was this page helpful?

Yes No No

 Need help with this topic?

 Want to try using Ask Learn to clarify or guide you through this topic?

Ask Learn Ask Learn
 Suggest a fix?

 Additional resources

Last updated on   2022-02-08

 Was this page helpful?

 Need help with this topic?

 Want to try using Ask Learn to clarify or guide you through this topic?

Ask Learn Ask Learn
 Suggest a fix?
