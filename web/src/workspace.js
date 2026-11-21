const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);
const stamp = (v) => v ? new Date(v).toLocaleString() : "No due date";
const shell = (eyebrow,title,desc,body) => '<div class="library-page workspace-page"><div class="eyebrow">'+eyebrow+'</div><h1>'+title+'</h1><p class="library-intro">'+desc+'</p>'+body+'</div>';
const empty = (s) => '<div class="empty-library">'+s+'</div>';

export async function renderWorkspacePage(view, area, ctx) {
 const {supabase,user,state,logActivity,escapeHtml} = ctx;
 if (view === "dashboard") {
   const [tasks,activity] = await Promise.all([
     supabase.from("tasks").select("id,title,status,priority,created_at").order("created_at",{ascending:false}).limit(5),
     supabase.from("activity_events").select("id,title,event_type,created_at").order("created_at",{ascending:false}).limit(5)
   ]);
   const pending=(tasks.data||[]).filter(t=>t.status!=="completed").length;
   const activePlugins=state.plugins.filter(p=>p.enabled).length;
   area.innerHTML=shell("PERSONAL COMMAND CENTER","Your workspace, <em>in control.</em>","A live overview of your JARVIS workspace and recent activity.",
    '<div class="dashboard-grid">'+
    '<article class="metric-card"><span>CONVERSATIONS</span><strong>'+state.conversations.length+'</strong><small>Saved in your account</small></article>'+
    '<article class="metric-card"><span>ACTIVE SKILLS</span><strong>'+state.skills.filter(s=>s.enabled).length+'</strong><small>Enabled instruction sets</small></article>'+
    '<article class="metric-card"><span>CONNECTED PLUGINS</span><strong>'+activePlugins+'</strong><small>Available integrations enabled</small></article>'+
    '<article class="metric-card"><span>OPEN TASKS</span><strong>'+pending+'</strong><small>Tasks not completed</small></article></div>'+
    '<div class="dashboard-columns"><section class="panel-card"><div class="section-heading"><h2>Recent conversations</h2><button data-go="chat">Open chat ↗</button></div>'+
    (state.conversations.slice(0,5).map(c=>'<button class="list-row" data-conversation="'+esc(c.id)+'"><span>'+esc(c.title||"New conversation")+'</span><small>'+stamp(c.updated_at)+'</small></button>').join("")||empty("Your conversations will appear here."))+
    '</section><section class="panel-card"><div class="section-heading"><h2>Recent activity</h2><button data-go="activity">View all ↗</button></div>'+
    ((activity.data||[]).map(a=>'<div class="list-row"><span>'+esc(a.title)+'</span><small>'+stamp(a.created_at)+'</small></div>').join("")||empty("Activity will appear as you use JARVIS."))+
    '</section></div>');
 } else if (view === "projects") {
   const {data:taskRows}=await supabase.from("tasks").select("id,project_id,status").eq("user_id",user.id);
   const counts={};
   (taskRows||[]).forEach(t=>{if(t.project_id)counts[t.project_id]=(counts[t.project_id]||0)+1;});
   area.innerHTML=shell("PROJECT WORKSPACE","Your <em>Projects</em>","Keep related tasks and work organized in dedicated project spaces.",
    '<form id="project-form" class="panel-card form-grid"><label>Project name<input id="project-name" maxlength="120" required placeholder="e.g. JARVIS Cloud"></label><label>Description<textarea id="project-description" maxlength="3000" placeholder="What is this project about?"></textarea></label><button class="upload-skill" type="submit">＋ Create project</button><div id="project-feedback" class="feedback"></div></form><div class="library-grid">'+
    ((state.projects||[]).map(p=>'<article class="library-card"><div class="library-card-top"><span class="plugin-category">'+esc((counts[p.id]||0)+' tasks')+'</span><select data-project-status="'+p.id+'"><option value="active" '+(p.status==="active"?"selected":"")+'>Active</option><option value="paused" '+(p.status==="paused"?"selected":"")+'>Paused</option><option value="completed" '+(p.status==="completed"?"selected":"")+'>Completed</option></select></div><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||"No description added.")+'</p><small>'+stamp(p.updated_at)+'</small><button class="delete-skill" data-project-delete="'+p.id+'">Delete project</button></article>').join("")||empty("No projects yet. Create one to organize your work."))+'</div>');
   area.querySelector("#project-form").addEventListener("submit",async e=>{e.preventDefault();const name=area.querySelector("#project-name").value.trim();const description=area.querySelector("#project-description").value.trim();const r=await supabase.from("projects").insert({user_id:user.id,name,description}).select("*").single();if(r.error){area.querySelector("#project-feedback").textContent=r.error.message;return;}state.projects.unshift(r.data);await logActivity("project_created","Created project: "+name);await renderWorkspacePage("projects",area,ctx);});
   area.querySelectorAll("[data-project-status]").forEach(el=>el.addEventListener("change",async()=>{const r=await supabase.from("projects").update({status:el.value,updated_at:new Date().toISOString()}).eq("id",el.dataset.projectStatus).eq("user_id",user.id);if(r.error)alert(r.error.message);else{state.projects=state.projects.map(p=>p.id===el.dataset.projectStatus?{...p,status:el.value}:p);await logActivity("project_updated","Updated project status");await renderWorkspacePage("projects",area,ctx);}}));
   area.querySelectorAll("[data-project-delete]").forEach(el=>el.addEventListener("click",async()=>{if(!confirm("Delete this project? Its tasks will remain, but become unassigned."))return;const r=await supabase.from("projects").delete().eq("id",el.dataset.projectDelete).eq("user_id",user.id);if(r.error)alert(r.error.message);else{state.projects=state.projects.filter(p=>p.id!==el.dataset.projectDelete);await logActivity("project_deleted","Deleted a project");await renderWorkspacePage("projects",area,ctx);}}));
 } else if (view === "memory") {
   const {data,error}=await supabase.from("memories").select("*").order("updated_at",{ascending:false});
   if(error){area.innerHTML=shell("PERSONAL CONTEXT","Memory <em>Vault</em>","Manage information JARVIS can use across conversations.",empty(esc(error.message)));return;}
   area.innerHTML=shell("PERSONAL CONTEXT","Memory <em>Vault</em>","Save useful context that can be reused in future conversations.",
    '<form id="memory-form" class="panel-card form-grid"><label>Memory type<select id="memory-type"><option value="general">General</option><option value="preference">Preference</option><option value="project">Project</option><option value="instruction">Instruction</option></select></label><label>Memory<textarea id="memory-content" maxlength="5000" required placeholder="Add a useful detail for future chats..."></textarea></label><button class="upload-skill" type="submit">＋ Save memory</button><div id="memory-feedback" class="feedback"></div></form><div class="library-grid">'+
    ((data||[]).map(m=>'<article class="library-card"><div class="library-card-top"><span class="plugin-category">'+esc(m.memory_type)+'</span><label class="toggle-line"><input type="checkbox" data-memory-toggle="'+m.id+'" '+(m.is_active?'checked':'')+'> Active</label></div><p>'+esc(m.content)+'</p><button class="delete-skill" data-memory-delete="'+m.id+'">Delete memory</button></article>').join("")||empty("No saved memories yet."))+'</div>');
   area.querySelector("#memory-form").addEventListener("submit",async e=>{e.preventDefault();const content=area.querySelector("#memory-content").value.trim();if(!content)return;const r=await supabase.from("memories").insert({user_id:user.id,memory_type:area.querySelector("#memory-type").value,content,is_active:true});if(r.error){area.querySelector("#memory-feedback").textContent=r.error.message;return;}await logActivity("memory_created","Saved a memory");await renderWorkspacePage("memory",area,ctx);});
   area.querySelectorAll("[data-memory-toggle]").forEach(el=>el.addEventListener("change",async()=>{const r=await supabase.from("memories").update({is_active:el.checked}).eq("id",el.dataset.memoryToggle);if(r.error)alert(r.error.message);else await renderWorkspacePage("memory",area,ctx);}));
   area.querySelectorAll("[data-memory-delete]").forEach(el=>el.addEventListener("click",async()=>{if(!confirm("Delete this saved memory?"))return;const r=await supabase.from("memories").delete().eq("id",el.dataset.memoryDelete);if(r.error)alert(r.error.message);else{await logActivity("memory_deleted","Deleted a memory");await renderWorkspacePage("memory",area,ctx);}}));
 } else if (view === "tasks") {
   const {data,error}=await supabase.from("tasks").select("*").order("created_at",{ascending:false});
   if(error){area.innerHTML=shell("EXECUTION BOARD","Tasks <em>Queue</em>","Manage tasks and review work created by JARVIS Agent Mode.",empty(esc(error.message)));return;}
   area.innerHTML=shell("EXECUTION BOARD","Tasks <em>Queue</em>","Track work in one place. Agent Mode can create and update tasks when you ask.",
    '<form id="task-form" class="panel-card form-grid"><label>Task title<input id="task-title" maxlength="180" required placeholder="What needs to get done?"></label><label>Description<textarea id="task-description" maxlength="3000" placeholder="Optional details"></textarea></label><div class="inline-fields"><label>Priority<select id="task-priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><label>Due date<input id="task-due" type="date"></label></div><button class="upload-skill" type="submit">＋ Add task</button><div id="task-feedback" class="feedback"></div></form><div class="library-grid">'+
    ((data||[]).map(t=>'<article class="library-card"><div class="library-card-top"><span class="plugin-category">'+esc(t.priority.toUpperCase())+'</span><select data-task-status="'+t.id+'"><option value="pending" '+(t.status==="pending"?"selected":"")+'>Pending</option><option value="in_progress" '+(t.status==="in_progress"?"selected":"")+'>In progress</option><option value="completed" '+(t.status==="completed"?"selected":"")+'>Completed</option><option value="cancelled" '+(t.status==="cancelled"?"selected":"")+'>Cancelled</option></select></div><h3>'+esc(t.title)+'</h3><p>'+esc(t.description)+'</p><div class="skill-file">Due: '+stamp(t.due_at)+'</div><button class="delete-skill" data-task-delete="'+t.id+'">Delete task</button></article>').join("")||empty("Your task queue is empty."))+'</div>');
   area.querySelector("#task-form").addEventListener("submit",async e=>{e.preventDefault();const title=area.querySelector("#task-title").value.trim();const due=area.querySelector("#task-due").value;const r=await supabase.from("tasks").insert({user_id:user.id,title,description:area.querySelector("#task-description").value.trim(),priority:area.querySelector("#task-priority").value,due_at:due?new Date(due+"T23:59:00").toISOString():null});if(r.error){area.querySelector("#task-feedback").textContent=r.error.message;return;}await logActivity("task_created","Created task: "+title);await renderWorkspacePage("tasks",area,ctx);});
   area.querySelectorAll("[data-task-status]").forEach(el=>el.addEventListener("change",async()=>{const r=await supabase.from("tasks").update({status:el.value,updated_at:new Date().toISOString()}).eq("id",el.dataset.taskStatus);if(r.error)alert(r.error.message);else{await logActivity("task_updated","Updated task status");await renderWorkspacePage("tasks",area,ctx);}}));
   area.querySelectorAll("[data-task-delete]").forEach(el=>el.addEventListener("click",async()=>{const r=await supabase.from("tasks").delete().eq("id",el.dataset.taskDelete);if(r.error)alert(r.error.message);else await renderWorkspacePage("tasks",area,ctx);}));
 } else if (view === "files") {
   const [chatFiles,skillFiles]=await Promise.all([
     supabase.storage.from("jarvis-user-files").list(user.id+"/chat",{limit:100,sortBy:{column:"created_at",order:"desc"}}),
     supabase.storage.from("jarvis-user-files").list(user.id+"/skills",{limit:100,sortBy:{column:"created_at",order:"desc"}})
   ]);
   const files=[...(chatFiles.data||[]).map(f=>({...f,path:user.id+"/chat/"+f.name,group:"Workspace"})),...(skillFiles.data||[]).map(f=>({...f,path:user.id+"/skills/"+f.name,group:"Skills"}))].filter(f=>f.name);
   area.innerHTML=shell("PRIVATE STORAGE","File <em>Workspace</em>","Upload, browse, open, and remove files stored privately in your JARVIS account.",
    '<div class="file-toolbar"><label class="upload-skill">＋ Upload files<input id="workspace-file-upload" type="file" hidden multiple accept="image/*,application/pdf,text/plain,text/markdown,application/json,.md,.txt,.csv,.js,.ts,.py,.html,.css"></label><input id="file-search" type="search" placeholder="Search your files..." aria-label="Search files"><span class="plugin-category">'+files.length+' files</span></div><div id="file-grid" class="library-grid">'+
    (files.map(f=>'<article class="library-card file-card" data-file-name="'+esc(f.name.toLowerCase())+'"><div class="library-card-top"><span class="plugin-category">'+f.group+'</span><span class="library-icon">⌁</span></div><h3>'+esc(f.name)+'</h3><p>'+esc(f.metadata?.mimetype||"Stored file")+' · '+Math.round((f.metadata?.size||0)/1024)+' KB</p><div class="library-actions"><button class="secondary-upload upload-skill" data-file-open="'+esc(f.path)+'">Preview / Open</button><button class="delete-skill" data-file-delete="'+esc(f.path)+'">Delete</button></div></article>').join("")||empty("No uploaded files found. Add a file to start your workspace."))+'</div>');
   area.querySelector("#workspace-file-upload").addEventListener("change",async event=>{
     const selected=[...event.target.files];
     for(const file of selected){
       if(file.size>20*1024*1024){alert(file.name+" exceeds 20 MB.");continue;}
       const path=user.id+"/chat/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
       const result=await supabase.storage.from("jarvis-user-files").upload(path,file,{upsert:false});
       if(result.error){alert(file.name+": "+result.error.message);continue;}
       await logActivity("file_uploaded","Uploaded file: "+file.name);
     }
     await renderWorkspacePage("files",area,ctx);
   });
   area.querySelector("#file-search").addEventListener("input",event=>{
     const q=event.target.value.toLowerCase();
     area.querySelectorAll(".file-card").forEach(card=>card.hidden=!card.dataset.fileName.includes(q));
   });
   area.querySelectorAll("[data-file-open]").forEach(b=>b.addEventListener("click",async()=>{
     const r=await supabase.storage.from("jarvis-user-files").createSignedUrl(b.dataset.fileOpen,300);
     if(r.error)alert(r.error.message);else window.open(r.data.signedUrl,"_blank","noopener");
   }));
   area.querySelectorAll("[data-file-delete]").forEach(b=>b.addEventListener("click",async()=>{
     if(!confirm("Delete this stored file?"))return;
     const r=await supabase.storage.from("jarvis-user-files").remove([b.dataset.fileDelete]);
     if(r.error)alert(r.error.message);else{await logActivity("file_deleted","Deleted a workspace file");await renderWorkspacePage("files",area,ctx);}
   }));
 } else if (view === "activity") {
   const [events,runs]=await Promise.all([
     supabase.from("activity_events").select("*").order("created_at",{ascending:false}).limit(100),
     supabase.from("agent_runs").select("id,conversation_id,goal,status,provider,model,actions,result,error,created_at,completed_at").order("created_at",{ascending:false}).limit(30)
   ]);
   const runCards=(runs.data||[]).map(run=>'<button class="list-row agent-run-row" '+(run.conversation_id?'data-conversation="'+esc(run.conversation_id)+'"':'')+'><span><b>'+esc(run.goal)+'</b><small>'+esc(run.provider)+' · '+esc(run.model)+' · '+(run.actions||[]).length+' tool actions</small></span><span class="run-meta"><i class="run-status '+esc(run.status)+'">'+esc(run.status.toUpperCase())+'</i><small>'+stamp(run.created_at)+'</small></span></button>').join("");
   const eventRows=(events.data||[]).map(a=>'<div class="list-row activity-row"><span><b>'+esc(a.title)+'</b><small>'+esc(a.event_type)+'</small></span><small>'+stamp(a.created_at)+'</small></div>').join("");
   area.innerHTML=shell("SYSTEM LOG","Activity <em>Feed</em>","Review agent executions and actions performed in your JARVIS workspace.",
    '<section class="panel-card"><div class="section-heading"><h2>Agent runs</h2><span class="plugin-category">'+(runs.data||[]).length+' recent</span></div>'+(runs.error?empty(esc(runs.error.message)):(runCards||empty("Agent runs will appear here when you use Agent Mode.")))+'</section><section class="panel-card" style="margin-top:16px"><div class="section-heading"><h2>Workspace activity</h2></div>'+(events.error?empty(esc(events.error.message)):(eventRows||empty("No activity recorded yet.")))+'</section>');
 } else if (view === "settings") {
   const {data}=await supabase.from("user_settings").select("*").eq("user_id",user.id).maybeSingle();
   area.innerHTML=shell("PREFERENCES & SECURITY","System <em>Settings</em>","Manage your workspace preferences. Provider API keys currently remain in memory only and must be re-entered after a full refresh.",
    '<form id="settings-form" class="panel-card form-grid"><label>Preferred provider<select id="settings-provider"><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option></select></label><label>Preferred model<input id="settings-model" maxlength="180" placeholder="Model ID"></label><label>Theme<select id="settings-theme"><option value="dark">Dark</option><option value="system">System</option><option value="light">Light</option></select></label><button class="upload-skill" type="submit">Save preferences</button><div id="settings-feedback" class="feedback"></div></form><div class="panel-card"><h2>Account</h2><p>'+esc(user.email||"Signed-in user")+'</p><p class="key-note">Your conversations, skills, memories, and uploaded files are stored in your Supabase account. Never paste a Supabase service-role key into this app.</p></div>');
   if(data){area.querySelector("#settings-provider").value=data.preferred_provider||"gemini";area.querySelector("#settings-model").value=data.preferred_model||"";area.querySelector("#settings-theme").value=data.theme||"dark";}
   area.querySelector("#settings-form").addEventListener("submit",async e=>{e.preventDefault();const r=await supabase.from("user_settings").upsert({user_id:user.id,preferred_provider:area.querySelector("#settings-provider").value,preferred_model:area.querySelector("#settings-model").value.trim()||null,theme:area.querySelector("#settings-theme").value,updated_at:new Date().toISOString()});area.querySelector("#settings-feedback").textContent=r.error?r.error.message:"Preferences saved.";if(!r.error)await logActivity("settings_updated","Updated workspace preferences");});
 }
 area.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>ctx.showView(b.dataset.go)));
 area.querySelectorAll("[data-conversation]").forEach(b=>b.addEventListener("click",()=>ctx.selectConversation(b.dataset.conversation)));
}
