FROM public.ecr.aws/amazonlinux/amazonlinux:2027@sha256:7a2b88a50427b797600b1f52cabd9948bbf25acb3f761e8c8bd6c86d11bb8942

RUN dnf install -y findutils \
    && dnf clean all

COPY scripts/log-cleanup.sh /usr/local/bin/log-cleanup
RUN chmod 755 /usr/local/bin/log-cleanup

ENTRYPOINT ["/usr/local/bin/log-cleanup"]
