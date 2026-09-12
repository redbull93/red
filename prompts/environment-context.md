# Environment context — stand-up thread

```
<environment>
  <place name="{{ENVIRONMENT_NAME}}" kind="slack|discord" />
  <channel id="{{CHANNEL_ID}}" thread="{{THREAD_ID}}" />
  <when iso="{{OCCURRED_AT}}" local="{{LOCAL_TIME}}" />
  <actors>
    {{#each ACTORS}}
    <actor id="{{id}}" role="{{role}}" present="{{present}}"
           may_act="{{may_act}}" language="{{language}}" />
    {{/each}}
  </actors>
  <signal type="standup.collected">
    {{SIGNAL_BODY}}
  </signal>
  <artifacts>
    {{#each ARTIFACTS}}
    <artifact kind="standup_reply" id="{{id}}">{{summary}}</artifact>
    {{/each}}
  </artifacts>
  <constraints>
    urgency: {{URGENCY}}
    language: {{LANGUAGE}}
    permission: channel_post
    irreversible_actions_require_hitl: true
  </constraints>
  <what_a_chatbox_would_never_know>
    Who already replied in DMs, who is named as a dependency, the
    scheduled stand-up ritual, and that the receipt must land in this
    team channel — not a new app.
    {{PLACE_ONLY_CONTEXT}}
  </what_a_chatbox_would_never_know>
</environment>
```
