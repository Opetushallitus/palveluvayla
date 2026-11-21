FROM public.ecr.aws/amazonlinux/amazonlinux:2027@sha256:be1f763aa39f6b64eb1c247de4a2caf826ac58c9ca8d581c105c1d05693063f8

RUN dnf install -y findutils \
    && dnf clean all

COPY scripts/log-cleanup.sh /usr/local/bin/log-cleanup
RUN chmod 755 /usr/local/bin/log-cleanup

ENTRYPOINT ["/usr/local/bin/log-cleanup"]
