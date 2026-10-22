FROM public.ecr.aws/amazonlinux/amazonlinux:2027@sha256:49740a1bc7030ec5744c9e761fbf8596b54f02ffdcda8e5b47ad7cfd78a65159

RUN dnf install -y findutils \
    && dnf clean all

COPY scripts/log-cleanup.sh /usr/local/bin/log-cleanup
RUN chmod 755 /usr/local/bin/log-cleanup

ENTRYPOINT ["/usr/local/bin/log-cleanup"]
