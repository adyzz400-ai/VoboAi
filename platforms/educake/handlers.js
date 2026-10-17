async 'edu:login:submit'(interaction) {
    const username = interaction.fields.getTextInputValue('username').trim();
    const password = interaction.fields.getTextInputValue('password');
    const accent = accentFor(interaction.user.id);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const status = async function (line) {
      const embed = new EmbedBuilder().setColor(accent).setAuthor({ name: 'Vobo AI · Educake' })
        .setDescription('Logging in — this panel updates live.')
        .addFields({ name: 'Status', value: line });
      await interaction.editReply({ embeds: [embed] }).catch(function () {});
    };

    await status('queued');

    const task = new Task({
      userId: interaction.user.id, kind: 'login', timeoutMs: 5 * 60 * 1000,
      run: async function () {
        try {
          const session = await educakeLogin({ username: username, password: password, onStatus: status });
          setPlatform(interaction.user.id, 'educake', {
            username: username, password: password, browser: session.browser, page: session.page,
            jwt: session.jwt, xsrf: session.xsrf, jwtExpUnix: Math.floor((jwtExpiryMs(session.jwt) ?? Date.now()) / 1000),
            baseUrl: session.baseUrl, waits: { min: config.waits.min, max: config.waits.max },
            includeImages: true, model: null, selectedAttemptId: null, quizzes: null, startedAt: Date.now()
          });

          await status('fetching quiz list');
          try {
            const result = await listQuizzes(getPlatform(interaction.user.id, 'educake'));
            patchPlatform(interaction.user.id, 'educake', { quizzes: result.quizzes });
          } catch (err) { warn('[educake] quiz list failed: ' + err.message); }

          const panel = await buildPanel({ interaction: interaction });
          
          // V1 editReply
          await interaction.editReply({ 
            embeds: [panel.embed],
            components: panel.components
          });
        } catch (err) {
          log('[educake] login error: ' + err.message);
          const embed = new EmbedBuilder().setColor(0xED4245).setAuthor({ name: 'Vobo AI · Educake' }).setDescription('❌ Login failed: ' + err.message);
          await interaction.editReply({ embeds: [embed] }).catch(function () {});
        }
      },
    });
    queue.enqueue(task);
  },

  async 'edu:timing:submit'(interaction) {
    const min = Number(interaction.fields.getTextInputValue('min'));
    const max = Number(interaction.fields.getTextInputValue('max'));
    if (!validWaits(min, max)) {
      const embed = new EmbedBuilder().setColor(0xED4245).setDescription('Invalid wait window.');
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
    }
    patchPlatform(interaction.user.id, 'educake', { waits: { min: min, max: max } });
    await interaction.deferUpdate();
    const panel = await buildPanel({ interaction: interaction });
    await interaction.editReply({ embeds: [panel.embed], components: panel.components });
  },

  async 'edu:settings:submit'(interaction) {
    const min = Number(interaction.fields.getTextInputValue('min'));
    const max = Number(interaction.fields.getTextInputValue('max'));
    const includeImages = (interaction.fields.getTextInputValue('includeImages') || 'yes').toLowerCase() !== 'no';
    const model = interaction.fields.getTextInputValue('model')?.trim() || null;
    if (!validWaits(min, max)) {
      const embed = new EmbedBuilder().setColor(0xED4245).setDescription('Invalid wait window.');
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
    }
    patchPlatform(interaction.user.id, 'educake', { waits: { min: min, max: max }, includeImages: includeImages, model: model });
    await interaction.deferUpdate();
    const panel = await buildPanel({ interaction: interaction });
    await interaction.editReply({ embeds: [panel.embed], components: panel.components });
  },

  async 'edu:quiz'(interaction) {
    const attemptId = Number(interaction.values[0]);
    patchPlatform(interaction.user.id, 'educake', { selectedAttemptId: attemptId });
    await interaction.deferUpdate();
    const panel = await buildPanel({ interaction: interaction });
    await interaction.editReply({ embeds: [panel.embed], components: panel.components });
  },
