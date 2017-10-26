const storage = require('../../services/storage');
const Media = require('../../entities/Media');

function generate(req, res, next) {
  let {
    tenant,
    preset,
    width,
    url,
  } = req._params;

  if (!url || !width || !tenant) {
    return res.sendStatus(400);
  }

  storage
    .meta(Media.create({
      tenant,
      url,
      width
    }))
    .then(media => {
      let exists = !!media.meta;

      if (exists) {
        // pipe media from storage to response
        storage
          .get(media)
          .then(media => {
            res.set('Content-Type', media.meta.ContentType);
            res.set('Content-Length', media.meta.ContentLength);
            res.set('Last-Modified', media.meta.LastModified);
            res.set('ETag', media.meta.ETag);
            res.set('Cache-Control', 'public, max-age=2592000');
            res.set('Expires', new Date(Date.now() + 2592000000).toUTCString());

            media.toStream().pipe(res);
          });

        return;
      }

      // request background prepare media
      // then pipe media from storage to response
      let channel = req.app.get('rpc');

      channel
        .request('prepare-media', {
          media: media.toJSON()
        })
        .waitFor(media.hash)
        .onResponse(message => {
          if (message && message.data && message.data.succeed) {
            return generate(req, res, next);
          }

          res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidat');
          res.set('Pragma', 'no-cache');
          res.set('Expires', 0);
          res.set('Surrogate-Control', 'no-store');
          res.sendStatus(404);
        })
        .send();
    });
}

module.exports = {
  generate
};
