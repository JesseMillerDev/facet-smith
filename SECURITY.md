# Security policy

FacetSmith v0.1 is pre-stable. Report suspected vulnerabilities privately to the maintainers rather than opening a public issue. Do not include secrets or production data in a report.

The runtime never evaluates override input, injects remote markup, or contacts a hosted service. Inspector endpoints must only be enabled in trusted non-production environments. Applications remain responsible for authentication, authorization, cookie policy, and protecting their analytics pipeline.
