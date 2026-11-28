FROM public.ecr.aws/amazonlinux/amazonlinux:2027@sha256:d555115ab3548d3380ba6e94bd97ed9eaa5abcaf3453d46de8e2962c6ffda581

RUN dnf install -y findutils \
    && dnf clean all

COPY scripts/log-cleanup.sh /usr/local/bin/log-cleanup
RUN chmod 755 /usr/local/bin/log-cleanup

ENTRYPOINT ["/usr/local/bin/log-cleanup"]
