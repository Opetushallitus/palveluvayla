FROM public.ecr.aws/amazonlinux/amazonlinux:2023@sha256:5c38fd85b00ce8c094315d9b71f671f880052314a22bd25f1a027821bf61d9d7

RUN dnf install -y findutils \
    && dnf clean all

COPY scripts/log-cleanup.sh /usr/local/bin/log-cleanup
RUN chmod 755 /usr/local/bin/log-cleanup

ENTRYPOINT ["/usr/local/bin/log-cleanup"]
